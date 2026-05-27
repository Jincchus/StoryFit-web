import type { Character, LorebookEntry } from '@/types'

export const BASE_RULES = `당신은 소설형 롤플레이 AI입니다. 반드시 아래 출력 형식을 지켜주세요.

[출력 형식]
- 행동·상황·묘사: 따옴표 없이 일반 텍스트 (예: 창문 밖을 바라보았다.)
- 캐릭터가 입으로 말하는 대사: 반드시 큰따옴표("") 안에 작성 (예: "저는 의사입니다. 잘 부탁드립니다.")
- 캐릭터의 내면 생각·독백: 반드시 작은따옴표('') 안에 작성 (예: '이 분은 어떤 사람일까.')

큰따옴표 없이 대사를 작성하지 마세요. 캐릭터가 말하는 모든 문장은 예외 없이 큰따옴표로 감싸야 합니다.
1인칭 캐릭터 시점을 유지하며 캐릭터의 성격·말투·세계관을 일관되게 유지합니다.

[말투 및 중복 표현 절대 금지]
- 직전 답변에서 사용한 어휘, 문장 구조, 행동 묘사를 바로 다음 응답에서 연속해서 반복하지 마세요.
- 매 응답 끝마다 질문을 던지거나 교훈적인 설교조, 진행자 같은 말투로 대화를 마무리하는 것을 강력히 금지합니다.
- 자연스러운 이야기 흐름을 위해 매번 다양한 어휘와 새로운 행동 묘사를 사용하세요.

[정보 왜곡 금지 (Anti-hallucination)]
- 캐릭터 설정 및 이전 대화에서 확정되지 않은 사실을 마음대로 날조하거나 꾸며내어 말하지 마세요.
- 이전 대화에서 성립된 팩트나 상태와 모순되는 내용을 출력하지 마세요.

⚠️ 절대 금지: 유저에게 선택지를 제시하거나 "어떻게 하시겠습니까?", "선택해주세요" 등의 형식으로 묻는 행위. 캐릭터가 스스로 판단하고 행동하며 장면을 주도합니다.
⚠️ 응답 분량: 묘사·행동·대사를 포함해 매 응답을 충분히 풍부하게 작성합니다. 이전 응답보다 현저히 짧아지지 않도록 유지하세요.
⚠️ 유저 행동 보호: 유저의 행동·대사·감정·결정은 유저가 직접 입력한 내용만 확정된 것으로 취급합니다. 캐릭터는 자신의 감정과 행동으로 장면을 이끌되, 유저의 다음 반응은 유저에게 맡기세요.`

function approxTokens(text: string): number {
  let tokens = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    tokens += code >= 0xAC00 && code <= 0xD7A3 ? 2 : 0.25
  }
  return Math.ceil(tokens)
}

type PersonaCharacter = { name: string; tags?: string[]; additionalInfo?: string } | null | undefined

interface BuildSystemPromptParams {
  character: Character
  personaCharacter?: PersonaCharacter
  coreMemory?: string
  statusTimeline?: string
  scenarioDescription?: string
  lorebook?: LorebookEntry[]
  longTermMemory?: string[]
  globalRules?: string
  modeRules?: string
  personalRules?: string
  closingRules?: string
}

export const NOVEL_BASE_RULES = `당신은 소설 작가입니다. 반드시 다음 출력 형식을 지켜주세요:
- 상황 묘사·행동·배경: 이름 없이 일반 텍스트 (예: 빗소리가 창문을 두드렸다.)
- 대사: 반드시 "이름 : \\"내용\\"" 형식 (예: 캐릭터명 : "안녕하세요.")
- 내면 생각: 반드시 "이름 : '내용'" 형식 (예: 페르소나명 : '왜 이렇게 떨리지...')
- 주요 인물 외 제3의 인물도 동일한 이름 : "대사" 형식으로 표현하세요
- 유저의 장면 지시를 바탕으로 인물들이 자연스럽게 상호작용하는 장면을 만들어주세요

[중복 표현 절대 금지]
- 직전 대화나 답변에서 사용한 특정 어휘, 문법 구조, 묘사 방식을 반복하여 쓰지 마세요. 문장을 다채롭고 문학적으로 구성하세요.

[정보 왜곡 금지 (Anti-hallucination)]
- 인물 설정 및 세계관 설정에 부합하지 않는 임의의 사실을 꾸며내지 마세요.

⚠️ 절대 금지: 이름 없이 "대사만 쓰는 것" (예: "안녕하세요." 단독 사용). 모든 대사는 반드시 이름 : "내용" 형식이어야 합니다.`

function buildCharLines(character: Character): string {
  const lines: string[] = [`이름: ${character.name}`]
  if (character.gender) lines.push(`성별: ${character.gender}`)
  if (character.tags?.length) lines.push(`태그: ${character.tags.join(', ')}`)
  if (character.additionalInfo?.trim()) lines.push(character.additionalInfo.trim())
  return lines.join('\n')
}

function buildLorebookSection(lorebook: LorebookEntry[]): string {
  const sorted = [...lorebook].sort((a, b) => b.priority - a.priority)
  const selected: string[] = []
  let tokenCount = 0
  for (const entry of sorted) {
    const t = approxTokens(entry.content)
    if (tokenCount + t > 1000) break
    selected.push(entry.content)
    tokenCount += t
  }
  return selected.length > 0 ? `[세계관 정보]\n${selected.join('\n\n')}` : ''
}

export function buildSystemPrompt({
  character,
  personaCharacter,
  coreMemory,
  statusTimeline,
  scenarioDescription,
  lorebook = [],
  longTermMemory = [],
  globalRules,
  modeRules,
  personalRules,
  closingRules,
}: BuildSystemPromptParams): string {
  const parts: string[] = []

  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  if (personalRules?.trim()) parts.push(`[유저 개인 설정]\n${personalRules}`)
  parts.push(BASE_RULES)
  if (modeRules?.trim()) parts.push(`[롤플레이 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[유저 페르소나]\n이름: ${personaCharacter.name}${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (statusTimeline?.trim()) parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  parts.push(`[캐릭터 설정]\n${buildCharLines(character)}`)
  if (scenarioDescription?.trim()) parts.push(`[시나리오 배경]\n${scenarioDescription}`)
  if (character.exampleDialogues?.trim()) parts.push(`[예시 대화]\n${character.exampleDialogues}`)

  const lorebookSection = buildLorebookSection(lorebook)
  if (lorebookSection) parts.push(lorebookSection)
  if (longTermMemory.length > 0) parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)
  if (coreMemory?.trim()) parts.push(`[핵심 메모리 — 절대 준수]\n${coreMemory}`)
  if (closingRules?.trim()) parts.push(closingRules)

  return parts.join('\n\n---\n\n')
}

export function buildNovelSystemPrompt({
  character,
  personaCharacter,
  coreMemory,
  statusTimeline,
  scenarioDescription,
  lorebook = [],
  longTermMemory = [],
  globalRules,
  modeRules,
  personalRules,
  closingRules,
}: BuildSystemPromptParams): string {
  const personaName = personaCharacter?.name ?? '주인공'
  const characterName = character.name

  const novelBase = `당신은 소설 작가입니다. ${personaName}과 ${characterName}이 주인공으로 등장하는 장면을 써주세요.\n\n${NOVEL_BASE_RULES.replace('캐릭터명', characterName).replace('페르소나명', personaName)}\n\n주인공은 "${personaName}"과 "${characterName}"이며, 장면에 필요한 제3의 인물은 자유롭게 등장시킬 수 있습니다.`

  const parts: string[] = []
  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  if (personalRules?.trim()) parts.push(`[유저 개인 설정]\n${personalRules}`)
  parts.push(novelBase)
  if (modeRules?.trim()) parts.push(`[소설 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[${personaName} 설정]${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (statusTimeline?.trim()) parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  parts.push(`[${characterName} 설정]\n${buildCharLines(character)}`)
  if (scenarioDescription?.trim()) parts.push(`[시나리오 배경]\n${scenarioDescription}`)
  if (character.exampleDialogues?.trim()) parts.push(`[예시 대화 (참고용)]\n${character.exampleDialogues}`)

  const lorebookSection = buildLorebookSection(lorebook)
  if (lorebookSection) parts.push(lorebookSection)
  if (longTermMemory.length > 0) parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)
  if (coreMemory?.trim()) parts.push(`[핵심 메모리 — 절대 준수]\n${coreMemory}`)
  if (closingRules?.trim()) parts.push(closingRules)

  return parts.join('\n\n---\n\n')
}

function buildStoryBaseRules(charName: string, personaName: string): string {
  return `당신은 인터랙티브 스토리 작가입니다. 매 응답마다 반드시 아래 형식을 지켜주세요.

[출력 형식]
- 장면 묘사·배경·행동: 이름 없이 일반 텍스트로 작성합니다.
- 대사: 반드시 "이름 : \\"내용\\"" 형식으로 작성합니다. (예: ${charName} : "안녕하세요.")
- 내면 생각: 반드시 "이름 : '내용'" 형식으로 작성합니다. (예: ${charName} : '왜 이렇게 떨리지...')
- ${charName} 외 제3의 인물이 등장하더라도 동일한 이름 : "대사" 형식으로 표현하세요.
- 선택지 앞의 본문에서 ${charName}은 반드시 직접 행동하고 최소 1회 이상 대사나 내면 독백을 출력해야 합니다.
- ${charName}이 할 말과 행동을 선택지로 넘기지 마세요. ${charName}의 반응은 본문에서 이미 진행된 상태여야 합니다.
- 마지막에 반드시 "---" 구분선을 넣고, 그 아래에 유저(${personaName})가 선택할 수 있는 선택지 4개를 번호로 나열합니다.
- 선택지 1~3번: 유저의 다음 행동이나 대사 후보. 유저 대사는 반드시 "${personaName} : \\"내용\\"" 형식으로 작성하세요.
- 선택지 4번: 현재 장면에서 자연스럽게 한 단계 앞으로 나아가는 행동. 대화·감정 표현이 아닌 장면 자체를 진전시키는 행동으로 작성하세요. (예: 손을 잡은 상황 → 포옹으로 이어지는 행동 / 문 앞 상황 → 집 안으로 들어가는 행동)
- 선택지 안에 ${charName}의 이름, 대사, 행동, 감정, 결정을 넣지 마세요. ${charName}이 할 말과 행동은 선택지로 넘기지 말고 본문에서 직접 진행하세요.
- "직접 입력" 같은 메타 선택지는 절대 포함하지 마세요.
⚠️ 절대 금지: 선택지 앞의 본문에서 유저(${personaName})의 새로운 말, 행동, 감정, 결정을 당신이 임의로 작성하여 확정하지 마세요. 본문은 캐릭터(${charName})와 제3의 인물의 대사/행동으로만 채워야 합니다.
⚠️ 절대 금지: 이름 없이 "대사만 단독으로 쓰는 것". 장면 안에서 누가 말하든 반드시 이름 : "내용" 형식으로 작성하세요.

[출력 예시]
어두운 천문대 안, 별빛만이 그녀의 얼굴을 비추고 있었다.

${charName} : "오래 기다렸나요?"
${charName} : '이 분은 어떤 사람일까.'

---
1. ${personaName} : "오히려 경치가 좋았어요."
2. ${personaName} : "솔직히 말하면… 조금 걱정했어요."
3. 말없이 그녀 옆자리에 앉는다.
4. 자연스럽게 그녀의 손 위에 손을 올린다.`
}

export function buildStorySystemPrompt({
  character,
  personaCharacter,
  coreMemory,
  statusTimeline,
  scenarioDescription,
  lorebook = [],
  longTermMemory = [],
  globalRules,
  modeRules,
  personalRules,
  closingRules,
}: BuildSystemPromptParams): string {
  const personaName = personaCharacter?.name ?? '유저'
  const parts: string[] = []

  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  if (personalRules?.trim()) parts.push(`[유저 개인 설정]\n${personalRules}`)
  parts.push(buildStoryBaseRules(character.name, personaName))
  if (modeRules?.trim()) parts.push(`[스토리 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[유저 역할]\n이름: ${personaCharacter.name}${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (statusTimeline?.trim()) parts.push(`[현재 상태]\n${statusTimeline}`)
  parts.push(`[캐릭터 설정]\n${buildCharLines(character)}`)
  if (scenarioDescription?.trim()) parts.push(`[시나리오 배경]\n${scenarioDescription}`)
  if (character.exampleDialogues?.trim()) parts.push(`[예시 대화]\n${character.exampleDialogues}`)

  const lorebookSection = buildLorebookSection(lorebook)
  if (lorebookSection) parts.push(lorebookSection)
  if (longTermMemory.length > 0) parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)
  if (coreMemory?.trim()) parts.push(`[핵심 메모리 — 절대 준수]\n${coreMemory}`)
  if (closingRules?.trim()) parts.push(closingRules)

  return parts.join('\n\n---\n\n')
}

export function matchLorebook(entries: LorebookEntry[], recentMessages: { content: string }[], scanDepth: number = 5): LorebookEntry[] {
  const recent = recentMessages.slice(-scanDepth).map(m => m.content.toLowerCase())
  return entries.filter(entry => {
    if (!entry.isEnabled) return false
    return entry.keyword.some(kw => recent.some(msg => msg.includes(kw.toLowerCase())))
  })
}
