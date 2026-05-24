import type { Character, LorebookEntry } from '@/types'

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
- 대사: 이름 : "내용" (예: 캐릭터명 : "안녕하세요.")
- 내면 생각: 이름 : '내용' (예: 페르소나명 : '왜 이렇게 떨리지...')
- 주요 인물 외 제3의 인물도 동일한 이름 : "대사" 형식으로 표현하세요
- 유저의 장면 지시를 바탕으로 인물들이 자연스럽게 상호작용하는 장면을 만들어주세요`

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
}: BuildSystemPromptParams): string {
  const parts: string[] = []

  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  parts.push(BASE_RULES)
  if (modeRules?.trim()) parts.push(`[롤플레이 추가 규칙]\n${modeRules}`)

  // 1. PersonaCharacter
  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[유저 페르소나]\n이름: ${personaCharacter.name}${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }

  // 2. Core memory
  if (coreMemory?.trim()) {
    parts.push(`[핵심 메모리 — 절대 잊지 마세요]\n${coreMemory}`)
  }

  // 3. Status timeline
  if (statusTimeline?.trim()) {
    parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  }

  // 4. Character setting + scenario description
  const charLines: string[] = [`이름: ${character.name}`]
  if (character.gender) charLines.push(`성별: ${character.gender}`)
  if (character.tags?.length) charLines.push(`태그: ${character.tags.join(', ')}`)
  if (character.additionalInfo?.trim()) charLines.push(character.additionalInfo.trim())
  parts.push(`[캐릭터 설정]\n${charLines.join('\n')}`)
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
  personaCharacter,
  coreMemory,
  statusTimeline,
  scenarioDescription,
  lorebook = [],
  longTermMemory = [],
  globalRules,
  modeRules,
}: BuildSystemPromptParams): string {
  const personaName = personaCharacter?.name ?? '주인공'
  const characterName = character.name

  const novelBase = `당신은 소설 작가입니다. ${personaName}과 ${characterName}이 주인공으로 등장하는 장면을 써주세요.\n\n${NOVEL_BASE_RULES.replace('캐릭터명', characterName).replace('페르소나명', personaName)}\n\n주인공은 "${personaName}"과 "${characterName}"이며, 장면에 필요한 제3의 인물은 자유롭게 등장시킬 수 있습니다.`

  const parts: string[] = []
  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  parts.push(novelBase)
  if (modeRules?.trim()) parts.push(`[소설 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[${personaName} 설정]${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (coreMemory?.trim()) {
    parts.push(`[핵심 메모리 — 절대 잊지 마세요]\n${coreMemory}`)
  }
  if (statusTimeline?.trim()) {
    parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  }
  const charLines2: string[] = [`이름: ${character.name}`]
  if (character.gender) charLines2.push(`성별: ${character.gender}`)
  if (character.tags?.length) charLines2.push(`태그: ${character.tags.join(', ')}`)
  if (character.additionalInfo?.trim()) charLines2.push(character.additionalInfo.trim())
  parts.push(`[${characterName} 설정]\n${charLines2.join('\n')}`)
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

function buildStoryBaseRules(charName: string, personaName: string): string {
  return `당신은 인터랙티브 스토리 작가입니다. 매 응답마다 반드시 아래 형식을 지켜주세요.

[출력 형식]
- 장면 묘사·배경·행동: 이름 없이 일반 텍스트로 작성합니다.
- 대사: 반드시 "이름 : \\"내용\\"" 형식으로 작성합니다. (예: ${charName} : "안녕하세요.")
- 내면 생각: 반드시 "이름 : '내용'" 형식으로 작성합니다. (예: ${charName} : '왜 이렇게 떨리지...')
- 마지막에 반드시 "---" 구분선을 넣고, 그 아래에 유저(${personaName})가 선택할 수 있는 선택지 2~3개를 번호로 나열합니다.
- 선택지는 반드시 유저의 행동이나 대사여야 합니다. "직접 입력" 같은 메타 선택지는 절대 포함하지 마세요.

[출력 예시]
어두운 천문대 안, 별빛만이 그녀의 얼굴을 비추고 있었다.

${charName} : "오래 기다렸나요?"
${charName} : '이 분은 어떤 사람일까.'

---
1. ${personaName} : "아니, 괜찮아요. 오히려 경치가 좋았어요."
2. ${personaName} : "솔직히 말하면… 조금 걱정했어요."
3. 말없이 그녀 옆자리에 앉는다.`
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
}: BuildSystemPromptParams): string {
  const parts: string[] = []

  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  const personaName = personaCharacter?.name ?? '유저'
  parts.push(buildStoryBaseRules(character.name, personaName))
  if (modeRules?.trim()) parts.push(`[스토리 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[유저 역할]\n이름: ${personaCharacter.name}${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (coreMemory?.trim()) parts.push(`[핵심 메모리 — 절대 잊지 마세요]\n${coreMemory}`)
  if (statusTimeline?.trim()) parts.push(`[현재 상태]\n${statusTimeline}`)

  const charLines: string[] = [`이름: ${character.name}`]
  if (character.gender) charLines.push(`성별: ${character.gender}`)
  if (character.tags?.length) charLines.push(`태그: ${character.tags.join(', ')}`)
  if (character.additionalInfo?.trim()) charLines.push(character.additionalInfo.trim())
  parts.push(`[캐릭터 설정]\n${charLines.join('\n')}`)

  if (scenarioDescription?.trim()) parts.push(`[시나리오 배경]\n${scenarioDescription}`)
  if (character.exampleDialogues?.trim()) parts.push(`[예시 대화]\n${character.exampleDialogues}`)

  if (lorebook.length > 0) {
    const sorted = [...lorebook].sort((a, b) => b.priority - a.priority)
    const selected: string[] = []
    let tokenCount = 0
    for (const entry of sorted) {
      const t = approxTokens(entry.content)
      if (tokenCount + t > 1000) break
      selected.push(entry.content)
      tokenCount += t
    }
    if (selected.length > 0) parts.push(`[세계관 정보]\n${selected.join('\n\n')}`)
  }
  if (longTermMemory.length > 0) parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)

  return parts.join('\n\n---\n\n')
}

export function matchLorebook(entries: LorebookEntry[], recentMessages: { content: string }[], scanDepth: number = 5): LorebookEntry[] {
  const recent = recentMessages.slice(-scanDepth).map(m => m.content.toLowerCase())
  return entries.filter(entry => {
    if (!entry.isEnabled) return false
    return entry.keyword.some(kw => recent.some(msg => msg.includes(kw.toLowerCase())))
  })
}
