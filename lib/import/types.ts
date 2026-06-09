// 사이트에서 수집한 원본 텍스트 섹션. text는 절대 변형하지 않는다(조립의 원천).
export interface CapturedSection {
  tab: string | null   // '상세 설명' | '첫 장면' | '인트로' | null
  text: string
}

export interface Captured {
  sections: CapturedSection[]
  title: string
  imageUrl: string
  universeUrl?: string
  loreUrls?: { url: string; name: string }[]
  assembledResult?: AssembledResult
  lorebooks?: { keyword: string[]; content: string; priority?: number }[]
}

// 번호 매긴 블록. text는 원본 부분문자열 그대로.
export interface Block {
  id: number
  text: string
  tabHint: string | null
}

export type PresetField =
  | 'additionalInfo'
  | 'openingMessage'
  | 'exampleDialogues'
  | 'scenario'
  | 'ignore'

export interface CharacterRef {
  index: number
  name: string
  gender: string
}

export interface BlockLabel {
  id: number
  owner: number | null   // 캐릭터 index 또는 null(공용/시나리오)
  field: PresetField
}

export interface Classification {
  title: string
  tags: string[]
  characters: CharacterRef[]
  blocks: BlockLabel[]
}

export interface AssembledCharacter {
  name: string
  gender: string
  tags?: string[]
  additionalInfo: string
  openingMessage: string
  openingMessages?: { id: string; title: string; content: string }[]
  exampleDialogues: string
  avatarUrl?: string
}

export interface AssembledResult {
  characters: AssembledCharacter[]
  scenarioDescription: string
  tags: string[]
  title: string
  safetyLevel?: string
  coverImageUrl?: string
}
