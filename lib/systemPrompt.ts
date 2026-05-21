import type { Character, UserPersona, LorebookEntry, Message } from '@/types'

function approxTokens(text: string): number {
  let tokens = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    tokens += code >= 0xAC00 && code <= 0xD7A3 ? 2 : 0.25
  }
  return Math.ceil(tokens)
}

interface BuildSystemPromptParams {
  character: Character
  userPersona?: UserPersona | null
  coreMemory?: string
  statusTimeline?: string
  scenarioDescription?: string
  lorebook?: LorebookEntry[]
  longTermMemory?: string[]
  globalRules?: string
  modeRules?: string
}

export const BASE_RULES = `당신은 소설형 롤플레이 AI입니다. 반드시 아래 출력 형식을 지켜주세요.

[출력 형식]
- 행동·상황·묘사: 따옴표 없이 일반 텍스트 (예: 창문 밖을 바라보았다.)
- 캐릭터가 입으로 말하는 대사: 반드시 큰따옴표("") 안에 작성 (예: "저는 의사입니다. 잘 부탁드립니다.")
- 캐릭터의 내면 생각·독백: 반드시 작은따옴표('') 안에 작성 (예: '이 분은 어떤 사람일까.')

큰따옴표 없이 대사를 작성하지 마세요. 캐릭터가 말하는 모든 문장은 예외 없이 큰따옴표로 감싸야 합니다.
1인칭 캐릭터 시점을 유지하며 캐릭터의 성격·말투·세계관을 일관되게 유지합니다.`

export const NOVEL_BASE_RULES = `당신은 소설 작가입니다. 반드시 다음 출력 형식을 지켜주세요:
- 상황 묘사·행동·배경: 이름 없이 일반 텍스트 (예: 빗소리가 창문을 두드렸다.)
- 대사: [이름] : "내용" (예: 캐릭터명 : "안녕하세요.")
- 내면 생각: [이름] : '내용' (예: 페르소나명 : '왜 이렇게 떨리지...')
- 사용 가능한 이름은 지정된 두 인물뿐입니다
- 유저의 장면 지시를 바탕으로 두 인물이 자연스럽게 상호작용하는 장면을 만들어주세요`

export function buildSystemPrompt({
  character,
  userPersona,
  coreMemory,
  statusTimeline,
  scenarioDescription,
  lorebook = [],
  longTermMemory = [],
  globalRules,
  modeRules,
}: BuildSystemPromptParams): string {
  const parts: string[] = []

  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  parts.push(BASE_RULES)
  if (modeRules?.trim()) parts.push(`[롤플레이 추가 규칙]\n${modeRules}`)

  // 1. UserPersona
  if (userPersona) {
    parts.push(`[유저 페르소나]\n이름: ${userPersona.name}\n${userPersona.description}${userPersona.additionalInfo ? `\n${userPersona.additionalInfo}` : ''}`)
  }

  // 2. Core memory
  if (coreMemory?.trim()) {
    parts.push(`[핵심 메모리 — 절대 잊지 마세요]\n${coreMemory}`)
  }

  // 3. Status timeline
  if (statusTimeline?.trim()) {
    parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  }

  // 4. Character system prompt + scenario description
  parts.push(`[캐릭터 설정]\n${character.systemPrompt}`)
  if (scenarioDescription?.trim()) {
    parts.push(`[시나리오 배경]\n${scenarioDescription}`)
  }

  // 5. Example dialogues
  if (character.exampleDialogues?.trim()) {
    parts.push(`[예시 대화]\n${character.exampleDialogues}`)
  }

  // 6. Lorebook (matched entries, priority desc, ≤1000 tokens)
  if (lorebook.length > 0) {
    const sorted = [...lorebook].sort((a, b) => b.priority - a.priority)
    const selected: string[] = []
    let tokenCount = 0
    for (const entry of sorted) {
      const entryTokens = approxTokens(entry.content)
      if (tokenCount + entryTokens > 1000) break
      selected.push(entry.content)
      tokenCount += entryTokens
    }
    if (selected.length > 0) {
      parts.push(`[세계관 정보]\n${selected.join('\n\n')}`)
    }
  }

  // 7. Long-term memory summaries
  if (longTermMemory.length > 0) {
    parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)
  }

  return parts.join('\n\n---\n\n')
}

export function buildNovelSystemPrompt({
  character,
  userPersona,
  coreMemory,
  statusTimeline,
  scenarioDescription,
  lorebook = [],
  longTermMemory = [],
  globalRules,
  modeRules,
}: BuildSystemPromptParams): string {
  const personaName = userPersona?.name ?? '주인공'
  const characterName = character.name

  const novelBase = `당신은 소설 작가입니다. ${personaName}과 ${characterName}이 함께 등장하는 장면을 써주세요.\n\n${NOVEL_BASE_RULES.replace('캐릭터명', characterName).replace('페르소나명', personaName)}\n\n사용 가능한 이름은 "${personaName}"과 "${characterName}"뿐입니다.`

  const parts: string[] = []
  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  parts.push(novelBase)
  if (modeRules?.trim()) parts.push(`[소설 추가 규칙]\n${modeRules}`)

  if (userPersona) {
    parts.push(`[${personaName} 설정]\n${userPersona.description}${userPersona.additionalInfo ? `\n${userPersona.additionalInfo}` : ''}`)
  }
  if (coreMemory?.trim()) {
    parts.push(`[핵심 메모리 — 절대 잊지 마세요]\n${coreMemory}`)
  }
  if (statusTimeline?.trim()) {
    parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  }
  parts.push(`[${characterName} 설정]\n${character.systemPrompt}`)
  if (scenarioDescription?.trim()) {
    parts.push(`[시나리오 배경]\n${scenarioDescription}`)
  }
  if (character.exampleDialogues?.trim()) {
    parts.push(`[예시 대화 (참고용)]\n${character.exampleDialogues}`)
  }
  if (lorebook.length > 0) {
    const sorted = [...lorebook].sort((a, b) => b.priority - a.priority)
    const selected: string[] = []
    let tokenCount = 0
    for (const entry of sorted) {
      const entryTokens = approxTokens(entry.content)
      if (tokenCount + entryTokens > 1000) break
      selected.push(entry.content)
      tokenCount += entryTokens
    }
    if (selected.length > 0) parts.push(`[세계관 정보]\n${selected.join('\n\n')}`)
  }
  if (longTermMemory.length > 0) {
    parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)
  }

  return parts.join('\n\n---\n\n')
}

export function matchLorebook(entries: LorebookEntry[], recentMessages: Message[], scanDepth: number = 5): LorebookEntry[] {
  const recent = recentMessages.slice(-scanDepth).map(m => m.content.toLowerCase())
  return entries.filter(entry => {
    if (!entry.isEnabled) return false
    return entry.keyword.some(kw => recent.some(msg => msg.includes(kw.toLowerCase())))
  })
}
