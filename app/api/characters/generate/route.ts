import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { style, theme } = await req.json()

  const styleName = style === 'eastern' ? '동양풍 (한국·일본·중국 문화권)' : '서양풍 (유럽·판타지·중세)'
  const themeClause = theme?.trim() ? `\n테마/분위기: ${theme.trim()}` : ''

  const systemPrompt = `당신은 롤플레이·소설 생성용 AI 캐릭터 디자이너입니다. 유저와 1:1 롤플레이 또는 소설 장면 생성에 사용될 캐릭터를 요청받은 스타일에 맞게 JSON으로 생성합니다.`
  const userPrompt = `스타일: ${styleName}${themeClause}

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

규칙:
- 모든 텍스트는 순수 한글로만 작성하세요. 영어·한자·괄호 표기를 절대 사용하지 마세요.
- name은 성과 이름을 모두 포함한 풀네임으로 작성하세요 (예: 김하루, 이세준).
  서양풍이라도 한글로 음차한 풀네임으로 작성하세요 (예: 에단 블레이크, 리아 솔베르그).
- tags는 아래 4개 카테고리에서 각각 1개 이상 5개 이하로 선정하세요.
  관계 태그: 유저와의 관계·거리감 (예: 소꿉친구, 연인, 라이벌, 스승, 낯선사람)
  성격 태그: 성격·말투 특징 (예: 냉정함, 다정함, 츤데레, 4차원, 독설가)
  외모 태그: 외모·인상 특징 (예: 은발, 안경, 긴머리, 날카로운눈매, 키가큼)
  역할 태그: 직업·역할·신분 (예: 의사, 형사, 마법사, 귀족, 학생)
  반드시 4개 카테고리 모두 포함해야 합니다.

{
  "name": "성 + 이름 풀네임",
  "gender": "남성 또는 여성 또는 빈문자열",
  "tags": ["관계태그1", "성격태그1", "성격태그2", "외모태그1", "외모태그2", "역할태그1"],
  "additionalInfo": "말투, 성격, 배경, 습관 등 구체적인 캐릭터 설정을 3~5문장으로",
  "exampleDialogues": "유저: (첫 만남 인사)\\n[이름]: (캐릭터 특유의 말투로 답변)\\n\\n유저: (근황 질문)\\n[이름]: (캐릭터 성격이 드러나는 답변)"
}

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
