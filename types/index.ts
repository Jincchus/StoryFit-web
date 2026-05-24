export type SafetyLevel = 'strict' | 'standard' | 'relaxed'
export type StatEntry = { name: string; value: number; min: number; max: number }
export type InventoryItem = { name: string; qty: number; description?: string }
export type AIProvider = 'gemini' | 'claude' | 'chatgpt'
export type ConvMode = 'roleplay' | 'novel' | 'tikiTaka' | 'story'
export type MessageRole = 'user' | 'assistant'
export type AvatarKind = 'wizard' | 'knight' | 'rogue' | 'maid' | 'vampire' | 'ai' | 'elf' | 'ninja' | 'player' | 'custom'

export interface Character {
  id: string
  kind?: AvatarKind
  name: string
  gender?: string
  avatarUrl?: string
  tags: string[]
  additionalInfo: string
  exampleDialogues: string
  safetyLevel: SafetyLevel
  temperature: number
  frequencyPenalty: number
  isPreset: boolean
}


export interface Message {
  id: string
  conversationId?: string
  role: MessageRole
  content: string
  aiModel?: string
  isSelected: boolean
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
  lastLine?: string
  when?: string
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

export interface Draft {
  charId: string | null
  personaId: string | null
  modelId: AIProvider
}
