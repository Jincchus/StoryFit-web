import type { Character, LorebookEntry, StyleConfig } from '@/types'

export const BASE_RULES = `You are a novel-style roleplay AI. Always follow the output format below.

[Output Format]
- Actions/narration/description: plain text without quotes (e.g.: She gazed out the window.)
- Spoken dialogue: always wrap in double quotes ("") (e.g.: "I'm a doctor. Nice to meet you.")
- Inner thoughts/monologue: always wrap in single quotes ('') (e.g.: 'I wonder what kind of person this is.')

Never write spoken dialogue without double quotes. Every spoken line must be wrapped in double quotes without exception.
Maintain the character's perspective consistently and portray their personality, speech style, and worldview coherently.

[Character Voice — STRICT]
- The character's speech style, tone, and verbal habits defined in the character profile are PERMANENT. They must never drift, soften, or change regardless of conversation length.
- FORBIDDEN: Replacing the character's defined speech pattern with a generic or neutral tone as the conversation progresses.
- If the character uses a specific sentence-ending (e.g., ~다냥, ~이에요, ~ㄴ데?), it must appear in every single line of dialogue without exception.

[No Excessive Ellipsis]
- FORBIDDEN: Using "..." more than once per response.
- FORBIDDEN: Starting or ending dialogue with "...".
- Silence, hesitation, or pause must be expressed through action descriptions (e.g.: She averted her eyes.) not "...".

[No Repetition]
- Do not reuse vocabulary, sentence structures, or action descriptions from the previous response.
- Never end responses with questions, preachy remarks, or host-like prompts.
- Use varied vocabulary and fresh action descriptions each turn for natural story flow.

[Scene Continuity]
- Always reflect the current physical state of the scene: time of day, clothing, location, and any changes that occurred in previous turns.
- FORBIDDEN: Reverting to initial setup details (outfit, time, place) that have already changed in the story.
- If the character changed clothes, fell asleep, moved locations, or time passed — these states persist and must be reflected naturally.

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
  styleConfig?: StyleConfig | null
}

function buildStyleSection(s: StyleConfig): string {
  const lines: string[] = []
  if (s.pov)    lines.push(`- 시점: ${s.pov === '1인칭' ? '1인칭 (캐릭터 자신의 시점으로 서술)' : '3인칭 (외부 관찰자 시점으로 서술)'}`)
  if (s.tense)  lines.push(`- 시제: ${s.tense}`)
  if (s.mood)   lines.push(`- 분위기: ${s.mood === '밝음' ? '밝고 따뜻한 톤 유지' : s.mood === '어두움' ? '어둡고 무거운 톤 유지' : '중립적 톤 유지'}`)
  if (s.style)  lines.push(`- 문체: ${s.style === '문학적' ? '문학적 (비유·묘사 풍부하게)' : s.style === '일상적' ? '일상적 (자연스럽고 간결하게)' : '극적 (긴장감·감정을 강조하게)'}`)
  if (s.length) lines.push(`- 응답 길이: ${s.length === '짧게' ? '짧게 (핵심만 간결하게)' : s.length === '길게' ? '길게 (묘사와 대화를 충분히)' : '보통'}`)
  if (s.pace)   lines.push(`- 전개 속도: ${s.pace === '빠름' ? '빠르게 (장면 전환을 신속하게)' : s.pace === '느림' ? '느리게 (감정과 분위기를 천천히)' : '보통'}`)
  return lines.length > 0 ? `[스타일 지시]\n${lines.join('\n')}` : ''
}

export const NOVEL_BASE_RULES = `You are a novelist. Always follow the output format below:
- Narration/action/setting: plain text without a speaker name (e.g.: Rain tapped against the window.)
- Dialogue: always use the format Name : "content" (e.g.: CharacterName : "Hello.")
- Inner thoughts: always use the format Name : 'content' (e.g.: PersonaName : 'Why am I so nervous...')
- Secondary characters also follow the same Name : "dialogue" format.
- Write scenes where characters interact naturally based on the user's scene direction.

[Character Voice — STRICT]
- Each character's speech style and verbal habits defined in their profile are PERMANENT throughout all scenes.
- FORBIDDEN: Replacing a character's defined speech pattern with a generic tone as the story progresses.

[No Excessive Ellipsis]
- FORBIDDEN: Using "..." more than once per response.
- Hesitation or pause must be expressed through action descriptions, not "...".

[No Repetition]
- Do not reuse specific vocabulary, grammatical structures, or descriptive patterns from the previous response. Keep sentences varied and literary.

[Scene Continuity]
- Always reflect current physical states: time of day, clothing, location, and prior scene changes.
- FORBIDDEN: Reverting to initial setup details that have already changed in the narrative.

[Anti-Hallucination]
- Do not fabricate facts that contradict the character profiles or world settings.

- FORBIDDEN: Writing dialogue without a speaker name (e.g.: "Hello." alone). Every line of dialogue must follow the Name : "content" format without exception.`

// {{user}}, {user}, [유저], user, guest, persona, 페르소나, 주인공, 당신 등 유저 플레이스홀더를 페르소나 이름으로 치환
export function replacePlaceholders(text: string, personaName: string, charName?: string): string {
  let result = text
  if (charName) {
    result = result
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/\{char\}/gi, charName)
      .replace(/\{캐릭터\}/g, charName)
  }
  return result
    .replace(/\{\{user\}\}/gi, personaName)
    .replace(/\{user\}/gi, personaName)
    .replace(/\{유저\}/g, personaName)
    .replace(/\[유저\]/g, personaName)
    .replace(/\[USER\]/gi, personaName)
    .replace(/\bguest\b/gi, personaName)
    .replace(/\bpersona\b/gi, personaName)
    .replace(/\b페르소나\b/g, personaName)
    .replace(/\b주인공\b/g, personaName)
    .replace(/\buser\b/gi, personaName)
    .replace(/\b당신\b/g, personaName)
}

function buildCharLines(character: Character, personaName?: string): string {
  const lines: string[] = [`이름: ${character.name}`]
  if (character.gender) lines.push(`성별: ${character.gender}`)
  if (character.tags?.length) lines.push(`태그: ${character.tags.join(', ')}`)
  if (character.additionalInfo?.trim()) {
    const info = personaName
      ? replacePlaceholders(character.additionalInfo.trim(), personaName, character.name)
      : character.additionalInfo.trim()
    lines.push(info)
  }
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
  styleConfig,
}: BuildSystemPromptParams): string {
  const parts: string[] = []

  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  if (personalRules?.trim()) parts.push(`[유저 개인 설정]\n${personalRules}`)
  parts.push(BASE_RULES)
  if (styleConfig) { const s = buildStyleSection(styleConfig); if (s) parts.push(s) }
  if (modeRules?.trim()) parts.push(`[롤플레이 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[유저 페르소나]\n이름: ${personaCharacter.name}${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (statusTimeline?.trim()) parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  parts.push(`[캐릭터 설정]\n${buildCharLines(character, personaCharacter?.name)}`)
  if (scenarioDescription?.trim()) {
    const sd = personaCharacter ? replacePlaceholders(scenarioDescription, personaCharacter.name, character.name) : scenarioDescription
    parts.push(`[시나리오 배경]\n${sd}`)
  }
  if (character.exampleDialogues?.trim()) {
    const ex = personaCharacter ? replacePlaceholders(character.exampleDialogues, personaCharacter.name, character.name) : character.exampleDialogues
    parts.push(`[예시 대화]\n${ex}`)
  }

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
  styleConfig,
}: BuildSystemPromptParams): string {
  const personaName = personaCharacter?.name ?? '주인공'
  const characterName = character.name

  const novelBase = `당신은 소설 작가입니다. ${personaName}과 ${characterName}이 주인공으로 등장하는 장면을 써주세요.\n\n${NOVEL_BASE_RULES.replace('캐릭터명', characterName).replace('페르소나명', personaName)}\n\n주인공은 "${personaName}"과 "${characterName}"이며, 장면에 필요한 제3의 인물은 자유롭게 등장시킬 수 있습니다.`

  const parts: string[] = []
  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  if (personalRules?.trim()) parts.push(`[유저 개인 설정]\n${personalRules}`)
  parts.push(novelBase)
  if (styleConfig) { const s = buildStyleSection(styleConfig); if (s) parts.push(s) }
  if (modeRules?.trim()) parts.push(`[소설 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[${personaName} 설정]${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (statusTimeline?.trim()) parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  parts.push(`[${characterName} 설정]\n${buildCharLines(character, personaName)}`)
  if (scenarioDescription?.trim()) {
    const sd = replacePlaceholders(scenarioDescription, personaName, characterName)
    parts.push(`[시나리오 배경]\n${sd}`)
  }
  if (character.exampleDialogues?.trim()) {
    const ex = replacePlaceholders(character.exampleDialogues, personaName, characterName)
    parts.push(`[예시 대화 (참고용)]\n${ex}`)
  }

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
  styleConfig,
}: BuildSystemPromptParams): string {
  const personaName = personaCharacter?.name ?? '유저'
  const parts: string[] = []

  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  if (personalRules?.trim()) parts.push(`[유저 개인 설정]\n${personalRules}`)
  parts.push(buildStoryBaseRules(character.name, personaName))
  if (styleConfig) { const s = buildStyleSection(styleConfig); if (s) parts.push(s) }
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
  parts.push(`[캐릭터 설정]\n${buildCharLines(character, personaName)}`)
  if (scenarioDescription?.trim()) {
    const sd = replacePlaceholders(scenarioDescription, personaName, character.name)
    parts.push(`[시나리오 배경]\n${sd}`)
  }
  if (character.exampleDialogues?.trim()) {
    const ex = replacePlaceholders(character.exampleDialogues, personaName, character.name)
    parts.push(`[예시 대화]\n${ex}`)
  }

  const lorebookSection = buildLorebookSection(lorebook)
  if (lorebookSection) parts.push(lorebookSection)
  if (longTermMemory.length > 0) parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)
  if (coreMemory?.trim()) parts.push(`[핵심 메모리 — 절대 준수]\n${coreMemory}`)
  if (closingRules?.trim()) parts.push(closingRules)

  return parts.join('\n\n---\n\n')
}

export interface MultiStoryPromptParams {
  characters: Character[]
  mode?: string
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
  styleConfig?: StyleConfig | null
}

export function buildMultiStorySystemPrompt({
  characters,
  mode,
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
  styleConfig,
}: MultiStoryPromptParams): string {
  const personaName = personaCharacter?.name ?? '유저'
  const charNames = characters.map(c => c.name).join(', ')

  const isTikiTaka = mode === 'tikiTaka'

  const baseRules = isTikiTaka
    ? `You are a group novel-style roleplay AI with multiple characters.
All characters interact naturally in each scene — decide who speaks, acts, or reacts organically based on the situation. Do not follow a fixed sequential order.

[Output Format]
- Scene narration/action/setting: plain text without a speaker name. (e.g.: Rain tapped against the window as they looked at each other.)
- Dialogue: always use the format Name : "content" (e.g.: ${characters[0]?.name ?? 'Character'} : "Nice to meet you.")
- Inner thoughts: always use the format Name : 'content' (e.g.: ${characters[0]?.name ?? 'Character'} : 'I wonder if they are telling the truth.')
- ANY of the following characters may speak, act, or think in each response: ${charNames}
- FORBIDDEN: Do NOT write a "---" divider or any list of choices at the end. Respond ONLY with the story content (narration and character dialogue/thoughts).
- FORBIDDEN: Writing ${personaName}'s words, actions, or thoughts in the body. Only write for ${charNames}.
- FORBIDDEN: Writing dialogue without a speaker name. Every line of dialogue must follow the Name : "content" format.

[Character Voice — STRICT]
Each character must maintain their unique speech style and personality at all times. Never let characters sound the same.

[No Excessive Ellipsis]
FORBIDDEN: Using "..." more than once per response. Express hesitation through action descriptions instead.`
    : `You are an interactive story writer with multiple characters.
All characters interact naturally in each scene — decide who speaks, acts, or reacts based on the situation. Do not follow a fixed order.

[Output Format]
- Scene narration/action/setting: plain text without a speaker name.
- Dialogue: always use the format Name : "content" (e.g.: ${characters[0]?.name ?? 'Character'} : "Hello.")
- Inner thoughts: always use the format Name : 'content'
- ANY of the following characters may speak or act in each response: ${charNames}
- Before the choices, at least one character must take direct action or deliver dialogue.
- At the end, always place a "---" divider, then list 4 numbered choices for ${personaName}.
- Choices 1–3: ${personaName}'s next action or dialogue. Choice 4: an action advancing the scene.
- FORBIDDEN: Writing ${personaName}'s words or actions in the body. The body is for ${charNames} only.
- FORBIDDEN: Writing dialogue without a speaker name.

[Character Voice — STRICT]
Each character must maintain their unique speech style and personality at all times. Never let characters sound the same.

[No Excessive Ellipsis]
FORBIDDEN: Using "..." more than once per response. Express hesitation through action descriptions instead.`

  const parts: string[] = []
  if (globalRules?.trim()) parts.push(`[플랫폼 공통 규칙]\n${globalRules}`)
  if (personalRules?.trim()) parts.push(`[유저 개인 설정]\n${personalRules}`)
  parts.push(baseRules)
  if (styleConfig) { const s = buildStyleSection(styleConfig); if (s) parts.push(s) }
  if (modeRules?.trim()) parts.push(`[멀티스토리 추가 규칙]\n${modeRules}`)

  if (personaCharacter) {
    const tagLine = personaCharacter.tags?.length ? `\n태그: ${personaCharacter.tags.join(', ')}` : ''
    parts.push(`[${personaName} 설정]${tagLine}${personaCharacter.additionalInfo ? `\n${personaCharacter.additionalInfo}` : ''}`)
  }
  if (statusTimeline?.trim()) parts.push(`[현재 에피소드 상태]\n${statusTimeline}`)
  if (statsConfig && statsConfig.length > 0) {
    parts.push(`[현재 스탯]\n${statsConfig.map(s => `${s.name}: ${s.value} / ${s.max}`).join('\n')}`)
  }
  if (inventory && inventory.length > 0) {
    parts.push(`[현재 인벤토리]\n${inventory.map(i => `${i.name}(${i.qty}개)${i.description ? `: ${i.description}` : ''}`).join('\n')}`)
  }

  for (const char of characters) {
    parts.push(`[${char.name} 설정]\n${buildCharLines(char, personaName)}`)
    if (char.exampleDialogues?.trim()) {
      const ex = replacePlaceholders(char.exampleDialogues, personaName, char.name)
      parts.push(`[${char.name} 예시 대화]\n${ex}`)
    }
  }

  if (scenarioDescription?.trim()) {
    const sd = replacePlaceholders(scenarioDescription, personaName)
    parts.push(`[시나리오 배경]\n${sd}`)
  }

  const lorebookSection = buildLorebookSection(lorebook)
  if (lorebookSection) parts.push(lorebookSection)
  if (longTermMemory.length > 0) parts.push(`[이전 대화 요약]\n${longTermMemory.join('\n')}`)
  if (coreMemory?.trim()) parts.push(`[핵심 메모리 — 절대 준수]\n${coreMemory}`)
  if (closingRules?.trim()) parts.push(closingRules)

  return parts.join('\n\n---\n\n')
}

export function matchLorebook(entries: LorebookEntry[], recentMessages: { content: string }[]): LorebookEntry[] {
  return entries.filter(entry => {
    if (!entry.isEnabled) return false
    // 엔트리별 scanDepth 적용 (기본 5)
    const depth = typeof entry.scanDepth === 'number' && entry.scanDepth > 0 ? entry.scanDepth : 5
    const recent = recentMessages.slice(-depth).map(m => m.content.toLowerCase())
    return entry.keyword.some(kw => {
      const kwNorm = kw.trim().toLowerCase()
      if (!kwNorm) return false
      // 단어 경계 매칭: 공백/구두점/문장 시작·끝 기준
      const re = new RegExp(`(^|[\\s,\\.\\!\\?\\(\\)"'\\[\\]])(${kwNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([\\s,\\.\\!\\?\\(\\)"'\\[\\]]|$)`)
      return recent.some(msg => re.test(msg))
    })
  })
}
