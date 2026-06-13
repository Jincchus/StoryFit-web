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

  const systemPrompt = '당신은 로어북 텍스트를 파싱하는 파서입니다. 반드시 JSON 배열만 반환합니다.'
  const userPrompt = `아래는 Zeta AI 로어북 페이지에서 전체 복사한 텍스트입니다.
이 텍스트에서 로어북 항목들을 분석하여 JSON 배열로 변환해 주세요.

[텍스트 구조 설명]
1. 각 항목은 "항목 제목(Name)"으로 시작합니다. (예: "낙해섬 마을주민", "낙해섬 시설" 등)
2. 항목 제목 바로 아래에는 해당 항목을 활성화할 "트리거 키워드(Keywords)"들이 한 줄에 하나씩 나열됩니다. (예: "마을주민", "김씨 아저씨", "이장", "아버지" 등)
3. 키워드 나열이 끝나면 본격적인 "항목 설명 내용(Content)"이 시작됩니다. 설명 내용은 여러 줄의 긴 텍스트이며, 다음 항목 제목이 나오기 전까지의 모든 내용이 하나의 설명 내용입니다.
4. 페이지 최상단의 "로어 정보", "대화량", "연결 플롯" 등의 메타데이터와 페이지 최하단의 "출시일", "수정일" 등은 로어북 항목이 아니므로 파싱에서 완전히 제외해야 합니다.

[파싱 예시]
입력 텍스트:
---
낙해섬 마을주민

마을주민
김씨 아저씨
이장
[이장 겸 준호의 아버지: 이만식 (60대)]
낙해섬의 절대 권력이자 마을 이장...
---
출력 JSON:
{
  "name": "낙해섬 마을주민",
  "keywords": ["낙해섬 마을주민", "마을주민", "김씨 아저씨", "이장"],
  "content": "[이장 겸 준호의 아버지: 이만식 (60대)]\\n낙해섬의 절대 권력이자 마을 이장..."
}

로어북 텍스트:
${text.slice(0, 30000)}

반환 형식 (마크다운 백틱 없이 순수 JSON 배열만 반환):
[
  {
    "name": "항목 제목",
    "keywords": ["키워드1", "키워드2", "키워드3"],
    "content": "설명 내용 전체 (줄바꿈 \\n 포함)"
  }
]

규칙:
- keywords 배열에는 항목 제목(name) 자체와 그 아래 한 줄씩 나열된 키워드들을 모두 포함시켜 주세요.
- content는 누락 없이 원래의 문맥과 설명, 줄바꿈을 완벽히 보존하여 추출해야 합니다.
- 반드시 유효한 JSON 배열 포맷으로만 응답하세요.`

  let entries: { name: string; keywords: string[]; content: string }[] = []
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt, 16384)
      entries = JSON.parse(extractJson(raw))
      if (Array.isArray(entries) && entries.length > 0) break
    } catch (e: any) {
      console.log('[lorebook-import] parse error attempt', i, ':', e?.message)
      if (i === 1) return NextResponse.json({ error: 'AI 파싱에 실패했습니다' }, { status: 500 })
    }
  }

  const created = await Promise.all(
    entries.slice(0, 80).map(e =>
      prisma.lorebook.create({
        data: {
          conversationId,
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
