import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'
import { generateText } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  try { await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') }
  catch { return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }) }

  const { name, title, gender, description } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: '이름이 필요합니다.' }, { status: 400 })

  const systemPrompt = '당신은 롤플레이용 캐릭터 시스템 프롬프트 작성 전문가입니다. 주어진 정보를 바탕으로 자연스럽고 구체적인 1인칭 시스템 프롬프트를 한국어로 작성하세요.'
  const userPrompt = `다음 정보를 바탕으로 AI 롤플레이 캐릭터의 시스템 프롬프트를 한국어로 작성해주세요.

이름: ${name}
${title ? `직함/역할: ${title}` : ''}
${gender ? `성별: ${gender}` : ''}
${description ? `설명: ${description}` : ''}

형식 지침:
- "당신은 [이름]입니다."로 시작
- 성격, 말투, 행동 특성을 구체적으로 서술
- 3~5문장으로 작성
- 롤플레이에 바로 사용할 수 있는 수준으로 작성`

  try {
    const result = await generateText(systemPrompt, userPrompt)
    return NextResponse.json({ systemPrompt: result })
  } catch {
    return NextResponse.json({ error: '생성에 실패했습니다.' }, { status: 500 })
  }
}
