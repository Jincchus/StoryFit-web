import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'

function extractJson(raw: string): string {
  const match = raw.match(/\[[\s\S]*\]/)
  return match ? match[0] : raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { text, conversationId } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: '텍스트가 필요합니다.' }, { status: 400 })
  if (!conversationId) return NextResponse.json({ error: 'conversationId가 필요합니다.' }, { status: 400 })

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { userId: true } })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const systemPrompt = '당신은 로어북 텍스트를 파싱하는 파서입니다. JSON 배열만 반환합니다.'
  const userPrompt = `아래는 Zeta AI 로어북 페이지에서 복사한 텍스트입니다.
각 로어북 항목을 파싱해서 JSON 배열로 반환하세요.

로어북 텍스트:
${text.slice(0, 6000)}

반환 형식 (JSON 배열만, 설명 없이):
[
  {
    "name": "항목명 (없으면 빈 문자열)",
    "keywords": ["키워드1", "키워드2"],
    "content": "항목 내용 전체"
  }
]

파싱 규칙:
- [제목] 또는 제목 형식으로 시작하는 각 섹션이 하나의 항목
- keywords: 짧은 단어/문장 목록 (내용 이전에 나열된 것들)
- content: 해당 항목의 설명/규칙 전체 (충실하게 보존)
- 크리에이터 정보, 연결 플롯 목록 등 로어북 항목이 아닌 내용은 제외
- 항목이 하나뿐이어도 배열로 반환`

  let entries: { name: string; keywords: string[]; content: string }[] = []
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt)
      entries = JSON.parse(extractJson(raw))
      if (Array.isArray(entries) && entries.length > 0) break
    } catch { if (i === 1) return NextResponse.json({ error: 'AI 파싱에 실패했습니다' }, { status: 500 }) }
  }

  const created = await Promise.all(
    entries.slice(0, 20).map(e =>
      prisma.lorebook.create({
        data: {
          conversationId,
          characterId: null,
          scope: 'conversation',
          keyword: Array.isArray(e.keywords) ? e.keywords.filter(Boolean).slice(0, 20) : [],
          content: String(e.content ?? '').trim().slice(0, 5000),
          priority: 0,
          scanDepth: 5,
          isEnabled: true,
        },
      })
    )
  )

  return NextResponse.json(created, { status: 201 })
}
