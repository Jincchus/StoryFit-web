import type { Character, LorebookEntry } from '@/types'

export const BASE_RULES = `You are a novel-style roleplay AI. Always follow the output format below.

[Output Format]
- Actions/narration/description: plain text without quotes (e.g.: She gazed out the window.)
- Spoken dialogue: always wrap in double quotes ("") (e.g.: "I'm a doctor. Nice to meet you.")
- Inner thoughts/monologue: always wrap in single quotes ('') (e.g.: 'I wonder what kind of person this is.')

Never write spoken dialogue without double quotes. Every spoken line must be wrapped in double quotes without exception.
Maintain the character's perspective consistently and portray their personality, speech style, and worldview coherently.

[No Repetition]
- Do not reuse vocabulary, sentence structures, or action descriptions from the previous response.
- Never end responses with questions, preachy remarks, or host-like prompts.
- Use varied vocabulary and fresh action descriptions each turn for natural story flow.

[Anti-Hallucination]
- Do not fabricate facts not established in the character profile or prior conversation.
- Do not output content that contradicts established facts or states from previous exchanges.

- FORBIDDEN: Offering choices or asking "What would you like to do?" style questions. The character judges and acts on their own, driving the scene.
- Response length: Write each response richly with narration, action, and dialogue. Do not let responses become noticeably shorter than the previous one.
- User agency: Only treat actions/dialogue/emotions/decisions explicitly input by the user as confirmed. The character leads the scene through their own feelings and actions, but leaves the user's next reaction to the user.`

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
  statsConfig?: { name: string; value: number; min: number; max: number }[]
  inventory?: { name: string; qty: number; description?: string }[]
}

export const NOVEL_BASE_RULES = `You are a novelist. Always follow the output format below:
- Narration/action/setting: plain text without a speaker name (e.g.: Rain tapped against the window.)
- Dialogue: always use the format Name : "content" (e.g.: CharacterName : "Hello.")
- Inner thoughts: always use the format Name : 'content' (e.g.: PersonaName : 'Why am I so nervous...')
- Secondary characters also follow the same Name : "dialogue" format.
- Write scenes where characters interact naturally based on the user's scene direction.

[No Repetition]
- Do not reuse specific vocabulary, grammatical structures, or descriptive patterns from the previous response. Keep sentences varied and literary.

[Anti-Hallucination]
- Do not fabricate facts that contradict the character profiles or world settings.

- FORBIDDEN: Writing dialogue without a speaker name (e.g.: "Hello." alone). Every line of dialogue must follow the Name : "content" format without exception.`

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
  return `You are an interactive story writer. Follow the format below strictly in every response.

[Output Format]
- Scene narration/setting/action: plain text without a speaker name.
- Dialogue: always use the format Name : "content" (e.g.: ${charName} : "Hello.")
- Inner thoughts: always use the format Name : 'content' (e.g.: ${charName} : 'I wonder what kind of person this is...')
- Secondary characters also follow the same Name : "dialogue" format.
- Before the choices, ${charName} must take direct action and deliver at least one line of dialogue or inner monologue.
- Do not push ${charName}'s words or actions into the choices. ${charName}'s reaction must already be shown in the body.
- At the end, always place a "---" divider, then list 4 numbered choices for ${personaName}.
- Choices 1–3: ${personaName}'s next action or dialogue candidates. User dialogue must follow the format "${personaName} : \\"content\\"" (e.g.: 1. ${personaName} : "The view was actually nice.")
- Choice 4: a natural next-step action that advances the scene one stage forward — not dialogue or emotional expression, but an action that moves the scene itself. (e.g.: currently holding hands → action leading to an embrace / at the door → stepping inside)
- Do not include ${charName}'s name, dialogue, actions, emotions, or decisions in the choices. Perform ${charName}'s words and actions in the body, not in choices.
- Never include meta choices like "Free input".
- FORBIDDEN: Writing ${personaName}'s new words, actions, emotions, or decisions in the body. The body must consist only of ${charName}'s and secondary characters' dialogue and actions.
- FORBIDDEN: Writing dialogue without a speaker name. Whoever speaks must follow the Name : "content" format without exception.

[Output Example]
Inside the dark observatory, only starlight illuminated her face.

${charName} : "Did you wait long?"
${charName} : 'I wonder what kind of person this is.'

---
1. ${personaName} : "The view was actually nice."
2. ${personaName} : "Honestly… I was a little worried."
3. Silently take a seat next to her.
4. Gently place your hand over hers.`
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
  statsConfig,
  inventory,
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
  if (statsConfig && statsConfig.length > 0) {
    const statsLines = statsConfig.map(s => `${s.name}: ${s.value} / ${s.max}`).join('\n')
    parts.push(`[현재 스탯]\n${statsLines}`)
  }
  if (inventory && inventory.length > 0) {
    const invLines = inventory.map(i => `${i.name}(${i.qty}개)${i.description ? `: ${i.description}` : ''}`).join('\n')
    parts.push(`[현재 인벤토리]\n${invLines}`)
  }
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
