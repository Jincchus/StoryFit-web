import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { style, gender, tags, name, additionalInfo, exampleDialogues } = await req.json()

  const needName = !name?.trim()
  const needAdditionalInfo = !additionalInfo?.trim()
  const needExampleDialogues = !exampleDialogues?.trim()

  if (!needName && !needAdditionalInfo && !needExampleDialogues) {
    return NextResponse.json({ error: '채울 항목이 없습니다.' }, { status: 400 })
  }

  const styleName = style === 'eastern' ? '동양풍 (한국·일본·중국 문화권)' : '서양풍 (유럽·판타지·중세)'
  const genderClause = gender ? `성별: ${gender}` : ''
  const tagsClause = tags?.length ? `선택된 태그: ${tags.join(', ')}` : ''
  const nameClause = !needName ? `이름: ${name} (이미 확정됨 — 이 이름을 그대로 사용)` : ''

  const contextLines = [styleName, genderClause, tagsClause, nameClause].filter(Boolean).join('\n')

  const fieldsToGenerate: string[] = []
  if (needName) fieldsToGenerate.push(`"name": "성 + 이름 풀네임 (한글, 성별·태그·스타일에 어울리게)"`)
  if (needAdditionalInfo) fieldsToGenerate.push(`"additionalInfo": "말투·성격·배경·습관을 3~5문장으로 (순수 한글)"`)
  if (needExampleDialogues) {
    const charName = needName ? '[생성된 이름]' : name
    fieldsToGenerate.push(`"exampleDialogues": "유저: (첫 만남 인사)\\n${charName}: (캐릭터 특유의 말투로 답변)\\n\\n유저: (근황 질문)\\n${charName}: (캐릭터 성격이 드러나는 답변)"`)
  }

  const systemPrompt = `당신은 롤플레이·소설 생성용 AI 캐릭터 디자이너입니다. 주어진 캐릭터 정보를 바탕으로 빈 항목만 채워 JSON으로 반환합니다.`

  const userPrompt = `캐릭터 정보:
${contextLines}

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.
모든 텍스트는 순수 한글로만 작성하고, 영어·한자·괄호 표기를 절대 사용하지 마세요.
${!needName ? `이름은 반드시 "${name}"을 그대로 exampleDialogues에 사용하세요.` : ''}
${needName ? `name은 서양풍이라도 한글로 음차한 풀네임으로 작성하세요 (예: 에단 블레이크).` : ''}

{
${fieldsToGenerate.join(',\n')}
}`

  try {
    const raw = await generateText(systemPrompt, userPrompt)
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const data = JSON.parse(jsonStr)

    const result: Record<string, string> = {}
    if (needName && data.name) result.name = data.name
    if (needAdditionalInfo && data.additionalInfo) result.additionalInfo = data.additionalInfo
    if (needExampleDialogues && data.exampleDialogues) result.exampleDialogues = data.exampleDialogues

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: '생성에 실패했습니다. 다시 시도해주세요.' }, { status: 500 })
  }
}
