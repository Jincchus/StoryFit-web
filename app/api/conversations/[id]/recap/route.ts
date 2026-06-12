import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: {
      userId: true,
      mode: true,
      chapter: true,
      scenarioDescription: true,
      coreMemory: true,
      statusTimeline: true,
      characters: { orderBy: { turnOrder: 'asc' }, select: { character: { select: { name: true } } } },
      personaCharacter: { select: { name: true } },
      memories: { orderBy: { createdAt: 'asc' }, select: { summary: true } },
      messages: {
        where: { isSelected: true, isStreaming: false },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { role: true, content: true },
      },
    },
  })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const charNames = conv.characters.map(cc => cc.character.name).join(', ')
  const personaName = conv.personaCharacter?.name ?? '나'
  const summaries = conv.memories.map((m, i) => `${i + 1}. ${m.summary}`).join('\n')
  const recentText = [...conv.messages].reverse()
    .map(m => `${m.role === 'user' ? personaName : '상대'}: ${m.content.slice(0, 300)}`)
    .join('\n')

  const systemPrompt = '당신은 연재 소설의 "지난 이야기" 코너를 쓰는 편집자입니다. 독자가 오랜만에 돌아와도 바로 몰입할 수 있게 줄거리를 정리합니다.'
  const userPrompt = `아래 정보로 "지금까지의 줄거리"를 작성하세요.

[시나리오 배경]
${conv.scenarioDescription || '(없음)'}

[등장인물] ${charNames} / 주인공(독자): ${personaName}

[핵심 설정 — 절대 누락 금지]
${conv.coreMemory || '(없음)'}

[시간순 사건 요약]
${summaries || '(요약 없음 — 최근 대화만 참고)'}

[가장 최근 장면]
${recentText || '(없음)'}

[현재 상태]
${conv.statusTimeline || '(없음)'}

작성 규칙:
- 마크다운으로 작성. 구성: **한 줄 요약** → 시간순 줄거리(2~4문단) → **현재 상황** (어디서 무엇을 하다 멈췄는지, 인물들의 상태)
- 독자에게 들려주듯 자연스러운 문장으로. 목록 나열보다 이야기 흐름으로
- 일어난 일만 정리하고, 앞으로의 전개를 추측하거나 암시하지 마라
- 전체 600자 이내`

  try {
    const recap = await generateText(systemPrompt, userPrompt, 2048)
    if (!recap.trim()) return NextResponse.json({ error: '요약 생성에 실패했습니다.' }, { status: 502 })
    return NextResponse.json({ recap: recap.trim() })
  } catch (err) {
    console.error('[recap] 생성 실패:', err)
    return NextResponse.json({ error: '요약 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 })
  }
}
