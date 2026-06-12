import type { Character, LorebookEntry, StyleConfig } from '@/types'
import { fixJosa, applyPersonaPlaceholders } from './josa'

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
  openingScene?: string
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

// {{user}}, {user}, [유저], user, guest, persona, 페르소나, 주인공, 당신 등 유저 플레이스홀더를 페르소나 이름으로 치환
export function replacePlaceholders(text: string, personaName: string, charName?: string): string {
  return fixJosa(applyPersonaPlaceholders(text, personaName, charName), [personaName, charName])
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

// 대화 도입부(오프닝)는 토큰 예산에 따라 최근 메시지 목록에서 잘려나갈 수 있다.
// 이 경우에도 AI가 최초 장면 설정을 계속 인지하도록 시스템 프롬프트에 별도로 고정한다.
function buildOpeningSceneSection(openingScene?: string): string {
  return openingScene?.trim()
    ? `[오프닝 장면 — 대화의 시작]\n${openingScene.trim()}\n\n위 오프닝 장면은 대화가 시작되기 직전에 일어난 일이며, 현재 진행 중인 상황입니다. 첫 응답은 이 장면에서 형성된 감정, 갈등, 분위기, 상황을 그대로 이어받아 자연스럽게 진행해야 합니다. 장면을 리셋하거나, 오프닝과 무관한 반응을 하거나, 갈등/감정 상태를 임의로 해소하지 마세요.`
    : ''
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
  openingScene,
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
  const personaName = personaCharacter?.name ?? '나'
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
  const openingSceneSection = buildOpeningSceneSection(openingScene)
  if (openingSceneSection) parts.push(openingSceneSection)
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
  personaCharacter?: PersonaCharacter
  coreMemory?: string
  statusTimeline?: string
  scenarioDescription?: string
  openingScene?: string
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
  personaCharacter,
  coreMemory,
  statusTimeline,
  scenarioDescription,
  openingScene,
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
  const personaName = personaCharacter?.name ?? '나'
  const charNames = characters.map(c => c.name).join(', ')

  const baseRules = `You are an interactive story writer with multiple characters.
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
  const openingSceneSection = buildOpeningSceneSection(openingScene)
  if (openingSceneSection) parts.push(openingSceneSection)

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
      // 한글 키워드는 조사가 바로 붙으므로("마왕성은") 단어 경계 대신 포함 매칭
      if (/[가-힣]/.test(kwNorm)) return recent.some(msg => msg.includes(kwNorm))
      // 라틴 키워드는 단어 경계 매칭: 공백/구두점/문장 시작·끝 기준
      const re = new RegExp(`(^|[\\s,\\.\\!\\?\\(\\)"'\\[\\]])(${kwNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([\\s,\\.\\!\\?\\(\\)"'\\[\\]]|$)`)
      return recent.some(msg => re.test(msg))
    })
  })
}
