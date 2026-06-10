export type CountableConversation = {
  isArchived: boolean
  rootConversationId: string | null
  mode: string
}

export type ConversationCounts = {
  activeCount: number
  archivedCount: number
}

export function aggregateCounts(conversations: CountableConversation[]): ConversationCounts {
  let activeCount = 0
  let archivedCount = 0
  for (const c of conversations) {
    if (c.rootConversationId !== null) continue
    if (c.mode === 'assistant') continue
    if (c.isArchived) archivedCount++
    else activeCount++
  }
  return { activeCount, archivedCount }
}

export function isCompleted(counts: ConversationCounts): boolean {
  return counts.activeCount === 0 && counts.archivedCount > 0
}

export function hasArchived(counts: ConversationCounts): boolean {
  return counts.archivedCount > 0
}
