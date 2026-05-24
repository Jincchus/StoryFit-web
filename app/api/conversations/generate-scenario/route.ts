import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { charName, charTags, charInfo, personaName, personaTags, mode, hint, worldTags } = await req.json()
  if (!charName?.trim()) return NextResponse.json({ error: '캐릭터 이름이 필요합니다.' }, { status: 400 })

  const modeLabel = mode === 'novel' ? '소설 (작가 시점)' : mode === 'story' ? '인터랙티브 스토리 (선택지 기반)' : '롤플레이 (1:1 대화)'
  const charContext = [
    `캐릭터: ${charName}`,
    charTags?.length ? `태그: ${charTags.join(', ')}` : '',
    charInfo?.trim() ? `설명: ${charInfo}` : '',
  ].filter(Boolean).join('\n')

  const personaContext = personaName
    ? [
        `유저 역할: ${personaName}`,
        personaTags?.length ? `유저 태그: ${personaTags.join(', ')}` : '',
      ].filter(Boolean).join('\n')
    : ''

  const hintLine = hint?.trim() ? `힌트: ${hint}` : ''
  const worldTagsLine = worldTags?.length ? `세계관 태그: ${worldTags.join(', ')}` : ''

  const context = [charContext, personaContext, `대화 모드: ${modeLabel}`, worldTagsLine, hintLine].filter(Boolean).join('\n')

  const systemPrompt = `당신은 롤플레이·소설용 시나리오 작가입니다. 캐릭터 정보를 바탕으로 흥미로운 시나리오 배경을 한국어로 작성합니다.`

  const userPrompt = `다음 캐릭터 정보를 바탕으로 시나리오 배경을 작성하세요.

${context}

요구사항:
- 2~4문장으로 간결하게 작성
- 장소, 시간적 배경, 현재 상황을 포함
- 캐릭터의 성격/설정과 자연스럽게 연결
- 순수 한글로만 작성 (영어·한자 사용 금지)
- JSON 형식으로 반환: {"scenarioDescription": "..."}
- 다른 텍스트는 절대 포함하지 마세요`

  try {
    const raw = await generateText(systemPrompt, userPrompt)
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const data = JSON.parse(jsonStr)
    if (!data.scenarioDescription) throw new Error('empty')
    return NextResponse.json({ scenarioDescription: data.scenarioDescription })
  } catch {
    return NextResponse.json({ error: '생성에 실패했습니다. 다시 시도해주세요.' }, { status: 500 })
  }
}
