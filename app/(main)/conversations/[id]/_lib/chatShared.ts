export interface Msg { id: string; role: string; content: string; aiModel?: string; branchCount?: number; branchIndex?: number; siblingIds?: string[]; parentId?: string | null; characterId?: string | null; inputTokens?: number; outputTokens?: number }
export interface PlotOutlineData {
  totalChapters: number
  mode: 'auto' | 'choice'
  ending: string
  chapters: { index: number; title: string; goal: string; events: string[]; transition: string }[]
}
export interface ConvChar { character: { id: string; name: string; kind: string; avatarUrl?: string; gender?: string; tags: string[]; additionalInfo: string; exampleDialogues: string; openingMessage?: string; isPreset: boolean } }
export interface Conv {
  id: string; title: string; mode: string; currentAI: string; coreMemory: string; statusTimeline: string; scenarioDescription: string; branchDescription: string
  statsEnabled: boolean; statsConfig: { name: string; value: number; min: number; max: number }[] | null
  inventoryEnabled: boolean; inventory: { name: string; qty: number; description?: string }[] | null
  styleConfig?: Record<string, string | null> | null
  sourceLorebookUrls?: { url: string; name: string }[] | null
  suggestRepliesEnabled?: boolean
  autoChapterEnabled?: boolean
  chapter?: number
  plotOutline?: PlotOutlineData | null
  characters: ConvChar[]
  personaCharacter?: { id: string; name: string; avatarUrl?: string | null; tags: string[]; additionalInfo: string } | null
  messages: Msg[]
}
export interface LbEntry { id: string; keyword: string[]; content: string; priority: number; scanDepth: number }
export interface BranchInfo { id: string; version: number; branchDescription: string; branchFromMessageId: string | null; rootConversationId: string | null }

export const COMMANDS = [
  { name: '!상태창', desc: '📊 전체 상태창 (스탯 + 소지품 + 상황)' },
  { name: '!스탯', desc: '❤️ 스탯 및 캐릭터 호감도 조회' },
  { name: '!인벤토리', desc: '🎒 소지하고 있는 아이템 목록 조회' },
  { name: '!상황', desc: '🎬 현재 씬의 상황(타임라인) 조회' },
  { name: '!도움말', desc: '⚙️ 시스템 명령어 도움말' },
]

export { parseStoryChoices } from '@/lib/responseControl'

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

export function isSamePerson(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = a.trim(), nb = b.trim()
  if (na === nb) return true
  if (Math.abs(na.length - nb.length) > 2) return false
  const maxDist = Math.max(1, Math.floor(Math.min(na.length, nb.length) / 3))
  return editDistance(na, nb) <= maxDist
}
