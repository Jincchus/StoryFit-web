export type SafetyLevel = 'strict' | 'standard' | 'relaxed'

export interface StyleConfig {
  pov?: '1인칭' | '3인칭' | null
  tense?: '현재형' | '과거형' | null
  mood?: '밝음' | '중립' | '어두움' | null
  style?: '문학적' | '일상적' | '극적' | null
  length?: { min?: number; max?: number } | null
  pace?: '빠름' | '보통' | '느림' | null
}
// changeRules/rangeStates는 외부 센터(tikita 변수 등)에서 온 게이지형 스탯의 부가 정보.
// changeRules: 언제 얼마만큼 증감하는지에 대한 규칙(상태 추적 프롬프트에 전달).
// rangeStates: 값 구간별 캐릭터 상태 서술([현재 스탯]·상태창에서 현재 값에 해당하는 구간만 노출).
export type StatRange = { lo: number; hi: number; text: string }
export type StatEntry = { name: string; value: number; min: number; max: number; changeRules?: string; rangeStates?: StatRange[] }
export type InventoryItem = { name: string; qty: number; description?: string }
export type AIProvider = 'gemini'
export type ConvMode = 'story' | 'multiStory' | 'assistant'
export type MessageRole = 'user' | 'assistant'
export type AvatarKind = 'wizard' | 'knight' | 'rogue' | 'maid' | 'vampire' | 'ai' | 'elf' | 'ninja' | 'player' | 'custom'

export interface CharacterCollection {
  id: string
  title: string
  sourceUrl?: string
}

export interface Character {
  id: string
  kind?: AvatarKind
  name: string
  gender?: string
  avatarUrl?: string
  tags: string[]
  additionalInfo: string
  secretSettings?: string
  exampleDialogues: string
  openingMessage?: string
  safetyLevel: SafetyLevel
  temperature: number
  frequencyPenalty: number
  maxOutputTokens?: number
  thinkingBudget?: number
  isPreset: boolean
  isAutoCreated?: boolean
  isPersonaPreset?: boolean
  collection?: CharacterCollection | null
  completed?: boolean
  hasArchived?: boolean
  started?: boolean
  createdAt?: string
  rooms?: { id: string; title: string }[]
}


export interface Message {
  id: string
  conversationId?: string
  role: MessageRole
  content: string
  aiModel?: string
  isSelected: boolean
  isStreaming?: boolean
  parentId: string | null
  characterId?: string | null
}

export interface Conversation {
  id: string
  title: string
  mode: ConvMode
  currentAI: AIProvider
  personaCharacterId: string | null
  personaCharacter?: { id: string; name: string; avatarUrl?: string | null; tags: string[]; additionalInfo: string } | null
  user?: { displayName?: string | null } | null
  coreMemory: string
  statusTimeline: string
  scenarioDescription: string
  isSummarizing: boolean
  autoChapterEnabled?: boolean
  characters: Character[]
  messages: Message[]
}

export interface AIModel {
  id: AIProvider
  name: string
  short: string
  tag: string
  className: string
  disabled: boolean
}

export interface Opening {
  id: string
  title: string
  content: string
  originalPreview?: string
  isGenerated?: boolean
}

export interface LorebookEntry {
  id: string
  keyword: string[]
  content: string
  priority: number
  scanDepth: number
  isEnabled: boolean
}

