// 외국 센터(Chub 등) 카드 필드를 자연스러운 한국어로 번역한다.
// 모델: gemini-2.5-pro(GEMINI_CHAT_MODEL) — 번역 품질 우선.
//   // TODO: flash로 변경 예정 — 비용/속도 이슈 시 GEMINI_UTILITY_MODEL로 교체.
//   // import { GEMINI_UTILITY_MODEL } from '@/lib/constants'  // flash 폴백용
import { generateText } from '@/lib/ai/gemini'
import { GEMINI_CHAT_MODEL } from '@/lib/constants'
import type { AssembledCharacter } from './types'

const TRANSLATE_MODEL = GEMINI_CHAT_MODEL
// const TRANSLATE_MODEL = GEMINI_UTILITY_MODEL  // TODO: flash로 변경 예정

// 번역 한정 안전 임계: relaxed(BLOCK_NONE).
// 이 앱은 NSFW 롤플레이를 지원하므로, 카드 단어가 안전 필터에 막혀 가져오기 자체가
// 실패하는 일을 막는다. 그래도 막히는 필드는 아래 try/catch로 '원문 보존' 폴백.
const TRANSLATE_SAFETY = 'relaxed' as const

const SYSTEM = `너는 영문 롤플레이 캐릭터 카드를 자연스러운 한국어로 번역한다.
규칙:
- {{char}}, {{user}}, {{char1}}, <START>, <END> 등 중괄호 매크로와 꺾쇠 마커는 절대 번역·삭제하지 말고 원문 그대로 둔다.
- 고유명사(인명·지명·작품명)는 원문(영문) 그대로 유지한다.
- 의미와 뉘앙스를 보존하되, 직역투가 아닌 자연스러운 한국어 번역체로 옮긴다.
- 줄바꿈·문단 구조·서식 기호(*, ", 목록 등)는 그대로 유지한다.
- 설명·주석·사족을 덧붙이지 말고 번역 결과만 출력한다.`

// 마크다운 코드펜스(```json ... ```)를 벗겨 순수 JSON 문자열을 얻는다.
function stripFence(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

// 짧은 필드 묶음을 JSON in → JSON out 1콜로 번역(키 유지, 값만 번역). 톤 일관성↑.
async function translateShortBatch(fields: Record<string, string>): Promise<Record<string, string>> {
  const entries = Object.entries(fields).filter(([, v]) => v?.trim())
  if (entries.length === 0) return {}
  const input = Object.fromEntries(entries)
  const userPrompt = `다음 JSON의 키는 그대로 두고 값만 한국어로 번역해, 동일한 JSON 구조로만 출력해라.\n\n${JSON.stringify(input, null, 2)}`
  try {
    const raw = await generateText(SYSTEM, userPrompt, 4096, TRANSLATE_SAFETY, 0, TRANSLATE_MODEL)
    const parsed = JSON.parse(stripFence(raw)) as Record<string, string>
    // 누락 키는 원문으로 메운다(부분 실패 방어).
    return Object.fromEntries(entries.map(([k, v]) => [k, parsed[k]?.trim() || v]))
  } catch {
    // 안전 필터 차단·파싱 실패 시 원문 유지(번역 누락이 가져오기 실패보다 낫다).
    return Object.fromEntries(entries)
  }
}

// 긴 서술문(도입부·예시대화)을 단건 번역(트렁케이션·JSON 깨짐 방지).
async function translateLong(text: string): Promise<string> {
  if (!text?.trim()) return text
  try {
    const out = await generateText(SYSTEM, text, 8192, TRANSLATE_SAFETY, 0, TRANSLATE_MODEL)
    return out.trim() || text
  } catch {
    // 안전 필터 차단·오류 시 원문(영문) 유지 — 사용자가 edit에서 다듬을 수 있다.
    return text
  }
}

// 카드 본문 번역(태그 제외 — 태그는 가져올 때 tagMap으로 정규화됨).
// 이름·gender·avatarUrl·tags는 그대로 통과. 차단/실패 필드는 원문 보존.
export async function translateContent(
  raw: AssembledCharacter,
  scenarioRaw: string,
): Promise<{ character: AssembledCharacter; scenarioDescription: string }> {
  // 1) 짧은 필드 + 시나리오 배치 번역
  const short = await translateShortBatch({
    additionalInfo: raw.additionalInfo,
    scenario: scenarioRaw,
  })

  // 2) 긴 서술 — 도입부 각 항목 + 예시대화 병렬 번역
  const openings = raw.openingMessages ?? []
  const [translatedOpenings, exampleDialogues] = await Promise.all([
    Promise.all(openings.map(async (o) => ({ ...o, content: await translateLong(o.content) }))),
    translateLong(raw.exampleDialogues),
  ])

  const openingMessage = translatedOpenings[0]?.content ?? (await translateLong(raw.openingMessage))

  const character: AssembledCharacter = {
    ...raw,
    additionalInfo: short.additionalInfo ?? raw.additionalInfo,
    openingMessage,
    openingMessages: translatedOpenings.length ? translatedOpenings : raw.openingMessages,
    exampleDialogues,
  }

  return { character, scenarioDescription: short.scenario ?? scenarioRaw }
}
