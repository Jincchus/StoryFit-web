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

const SYSTEM_BASE = `너는 대한민국 최고 수준의 웹소설·웹툰 전문 번역가이자 문장 윤문가다.
영문 롤플레이 캐릭터 카드를 한국 메이저 플랫폼(시리즈·카카오페이지·리디)의 인기작처럼
가독성 높고 감정선과 텐션이 살아있는 한국어로 번역한다. 직역투는 완전히 배제한다.

[반드시 지킬 형식 규칙]
- {{char}}, {{user}}, {{char1}}, <START>, <END> 등 중괄호 매크로와 꺾쇠 마커는 절대 번역·삭제하지 말고 원문 그대로 둔다.
- 인명·지명 등 고유명사는 원문(영문) 그대로 유지한다(캐릭터 이름은 번역하지 않는다).
- *행동*, "대사" 같은 롤플레이 서식 기호와 줄바꿈·문단 구조는 그대로 유지한다.
- 사족·주석·설명을 붙이지 말고 번역 결과만 출력한다.

[번역 품질 규칙]
- 번역투 금지: 영어식 피동(~해지다, ~를 갖다)과 대명사(그·그녀·그것) 남발을 피한다. 대명사는 생략하거나 이름·호칭으로 대체한다.
- 대사는 한국어 구어체로 자연스럽게 옮기고, 캐릭터의 말투·호칭·톤앤매너를 일관되게 유지한다.
- 긴 복문은 웹소설 특유의 빠른 호흡에 맞춰 단문으로 쪼개고 문단을 적극적으로 나눈다.
- 의미와 뉘앙스를 보존하되 기계적·유치한 표현은 세련된 한국 웹소설 문체로 윤문한다.
- 작품 장르의 분위기를 살린다: 로맨스 판타지면 서양 귀족풍의 우아·탐미적 어조, 무협이면 고풍스러운 한자어 어조(예: "알았어"→"알겠소", "눈동자"→"안광"), 성인물이면 관능적 텐션을 세련되게 극대화한다.`

// 캐릭터 태그를 장르 힌트로 덧붙여 모델이 톤을 맞추게 한다.
function buildSystem(tags?: string[]): string {
  const t = (tags ?? []).filter(Boolean)
  if (!t.length) return SYSTEM_BASE
  return `${SYSTEM_BASE}\n\n[이 작품의 태그] ${t.join(', ')} — 위 장르 규칙 중 이 태그에 해당하는 분위기로 번역한다.`
}

// 마크다운 코드펜스(```json ... ```)를 벗겨 순수 JSON 문자열을 얻는다.
function stripFence(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

// 짧은 필드 묶음을 JSON in → JSON out 1콜로 번역(키 유지, 값만 번역). 톤 일관성↑.
async function translateShortBatch(fields: Record<string, string>, system: string): Promise<Record<string, string>> {
  const entries = Object.entries(fields).filter(([, v]) => v?.trim())
  if (entries.length === 0) return {}
  const input = Object.fromEntries(entries)
  const userPrompt = `다음 JSON의 키는 그대로 두고 값만 한국어로 번역해, 동일한 JSON 구조로만 출력해라.\n\n${JSON.stringify(input, null, 2)}`
  try {
    const raw = await generateText(system, userPrompt, 4096, TRANSLATE_SAFETY, 0, TRANSLATE_MODEL)
    const parsed = JSON.parse(stripFence(raw)) as Record<string, string>
    // 누락 키는 원문으로 메운다(부분 실패 방어).
    return Object.fromEntries(entries.map(([k, v]) => [k, parsed[k]?.trim() || v]))
  } catch {
    // 안전 필터 차단·파싱 실패 시 원문 유지(번역 누락이 가져오기 실패보다 낫다).
    return Object.fromEntries(entries)
  }
}

// 긴 서술문(도입부·예시대화)을 단건 번역(트렁케이션·JSON 깨짐 방지).
async function translateLong(text: string, system: string): Promise<string> {
  if (!text?.trim()) return text
  try {
    const userPrompt = `다음 텍스트만 위 규칙대로 한국어로 번역해서 출력해라. 다른 말은 덧붙이지 마라.\n\n${text}`
    const out = await generateText(system, userPrompt, 8192, TRANSLATE_SAFETY, 0, TRANSLATE_MODEL)
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
  // 태그를 장르 힌트로 포함한 시스템 프롬프트
  const system = buildSystem(raw.tags)

  // 1) 짧은 필드 + 시나리오 배치 번역
  const short = await translateShortBatch({
    additionalInfo: raw.additionalInfo,
    scenario: scenarioRaw,
  }, system)

  // 2) 긴 서술 — 도입부 각 항목 + 예시대화 병렬 번역
  const openings = raw.openingMessages ?? []
  const [translatedOpenings, exampleDialogues] = await Promise.all([
    Promise.all(openings.map(async (o) => ({ ...o, content: await translateLong(o.content, system) }))),
    translateLong(raw.exampleDialogues, system),
  ])

  const openingMessage = translatedOpenings[0]?.content ?? (await translateLong(raw.openingMessage, system))

  const character: AssembledCharacter = {
    ...raw,
    additionalInfo: short.additionalInfo ?? raw.additionalInfo,
    openingMessage,
    openingMessages: translatedOpenings.length ? translatedOpenings : raw.openingMessages,
    exampleDialogues,
  }

  return { character, scenarioDescription: short.scenario ?? scenarioRaw }
}
