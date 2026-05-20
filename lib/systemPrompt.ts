import type { Character, UserPersona, LorebookEntry, Message } from '@/types'

interface BuildSystemPromptParams {
  character: Character
  userPersona?: UserPersona | null
  coreMemory?: string
  statusTimeline?: string
  lorebook?: LorebookEntry[]
  longTermMemory?: string[]
}

const BASE_RULES = `당신은 소설형 롤플레이 AI입니다. 다음 규칙을 반드시 따르세요:
- 1인칭 캐릭터 시점으로 대화합니다
- 상황 묘사·행동·설명은 따옴표 없이 일반 텍스트로 씁니다 (예: 창문 밖을 바라보았다.)
- 대사(말하는 내용)는 반드시 큰따옴표로 감쌉니다 (예: "안녕하세요.")
- 내면의 생각은 반드시 작은따옴표로 감쌉니다 (예: '이 사람은 좋은 사람 같아.')
- 유저의 입력에 자연스럽게 반응하며 대화를 이어갑니다
- 캐릭터의 성격, 말투, 세계관을 일관되게 유지합니다`

export function buildSystemPrompt({
  character,
  userPersona,
  coreMemory,
  statusTimeline,
  lorebook = [],
  longTermMemory = [],
}: BuildSystemPromptParams): string {
  const parts: string[] = []

  // 0. Base rules
  parts.push(BASE_RULES)

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
  if (character.scenarioDescription?.trim()) {
    parts.push(`[시나리오 배경]\n${character.scenarioDescription}`)
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
      const approxTokens = Math.ceil(entry.content.length / 4)
      if (tokenCount + approxTokens > 1000) break
      selected.push(entry.content)
      tokenCount += approxTokens
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

export function matchLorebook(entries: LorebookEntry[], recentMessages: Message[], scanDepth: number = 5): LorebookEntry[] {
  const recent = recentMessages.slice(-scanDepth).map(m => m.content.toLowerCase())
  return entries.filter(entry => {
    if (!entry.isEnabled) return false
    return entry.keyword.some(kw => recent.some(msg => msg.includes(kw.toLowerCase())))
  })
}
