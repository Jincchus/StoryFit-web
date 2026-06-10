export type SafetyLevel = 'strict' | 'standard' | 'relaxed'

export interface StyleConfig {
  pov?: '1인칭' | '3인칭' | null
  tense?: '현재형' | '과거형' | null
  mood?: '밝음' | '중립' | '어두움' | null
  style?: '문학적' | '일상적' | '극적' | null
  length?: '짧게' | '보통' | '길게' | null
  pace?: '빠름' | '보통' | '느림' | null
}
export type StatEntry = { name: string; value: number; min: number; max: number }
export type InventoryItem = { name: string; qty: number; description?: string }
export type AIProvider = 'gemini' | 'claude' | 'chatgpt'
export type ConvMode = 'roleplay' | 'novel' | 'tikiTaka' | 'story'
export type MessageRole = 'user' | 'assistant'
export type AvatarKind = 'wizard' | 'knight' | 'rogue' | 'maid' | 'vampire' | 'ai' | 'elf' | 'ninja' | 'player' | 'custom'

export interface CharacterCollection {
  id: string
  title: string
}

export interface Character {
  id: string
  kind?: AvatarKind
  name: string
  gender?: string
  avatarUrl?: string
  tags: string[]
  additionalInfo: string
  exampleDialogues: string
  openingMessage?: string
  safetyLevel: SafetyLevel
  temperature: number
  frequencyPenalty: number
  maxOutputTokens?: number
  thinkingBudget?: number
  isPreset: boolean
  isAutoCreated?: boolean
  collection?: CharacterCollection | null
  completed?: boolean
  hasArchived?: boolean
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
  coreMemory: string
  statusTimeline: string
  scenarioDescription: string
  isSummarizing: boolean
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

export interface LorebookEntry {
  id: string
  scope: 'conversation' | 'character'
  scopeId: string
  keyword: string[]
  content: string
  priority: number
  scanDepth: number
  isEnabled: boolean
}

