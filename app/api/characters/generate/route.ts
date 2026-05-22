import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { style, theme } = await req.json()

  const styleName = style === 'eastern' ? '동양풍 (한국·일본·중국 문화권)' : '서양풍 (유럽·판타지·중세)'
  const themeClause = theme?.trim() ? `\n테마/분위기: ${theme.trim()}` : ''

  const systemPrompt = `당신은 롤플레이 AI 캐릭터 디자이너입니다. 요청받은 스타일에 맞는 캐릭터를 JSON으로 생성합니다.`
  const userPrompt = `스타일: ${styleName}${themeClause}

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "name": "캐릭터 이름 (스타일에 맞는 이름)",
  "gender": "남성 또는 여성 또는 빈문자열",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "additionalInfo": "말투, 성격, 배경, 습관 등 구체적인 캐릭터 설정을 3~5문장으로",
  "exampleDialogues": "유저: (첫 만남 인사)\\n[이름]: (캐릭터 특유의 말투로 답변)\\n\\n유저: (근황 질문)\\n[이름]: (캐릭터 성격이 드러나는 답변)"
}

태그는 성격·외모·관계·역할 중에서 이 캐릭터에게 어울리는 것들을 자유롭게 선택하세요 (5~8개).
exampleDialogues의 [이름] 자리에는 실제 캐릭터 이름을 사용하세요.`

  try {
    const raw = await generateText(systemPrompt, userPrompt)
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const data = JSON.parse(jsonStr)
    return NextResponse.json({
      name: data.name ?? '',
      gender: data.gender ?? '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      additionalInfo: data.additionalInfo ?? '',
      exampleDialogues: data.exampleDialogues ?? '',
    })
  } catch {
    return NextResponse.json({ error: '캐릭터 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 500 })
  }
}
