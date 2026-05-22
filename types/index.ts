export type SafetyLevel = 'strict' | 'standard' | 'relaxed'
export type AIProvider = 'gemini' | 'claude' | 'chatgpt'
export type ConvMode = 'roleplay' | 'novel' | 'tikiTaka'
export type MessageRole = 'user' | 'assistant'
export type AvatarKind = 'wizard' | 'knight' | 'rogue' | 'maid' | 'vampire' | 'ai' | 'elf' | 'ninja' | 'player' | 'custom'

export interface Character {
  id: string
  kind: AvatarKind
  name: string
  title: string
  gender: string
  description: string
  systemPrompt: string
  exampleDialogues: string
  avatarUrl?: string
  safetyLevel: SafetyLevel
  temperature: number
  frequencyPenalty: number
  presencePenalty: number
  defaultAI: AIProvider
  isPreset: boolean
}

export interface UserPersona {
  id: string
  name: string
  description: string
  additionalInfo: string
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
  userPersonaId: string | null
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
