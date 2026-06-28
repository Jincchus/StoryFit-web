export type ThreadNode = { id: string; rootConversationId: string | null; updatedAt: Date | string; isArchived?: boolean }

// 스레드(rootConversationId ?? id)별로 updatedAt 최대 노드를 골라 updatedAt desc 정렬, 상위 limit개 id 반환.
// 완결(루트 Conversation이 archived) 스레드는 분기가 비-archived여도 제외하고, 개별 archived 노드도 후보에서 제외한다.
// (완결 판정은 루트 기준 — 분기는 isArchived가 갱신되지 않으므로 루트만 본다. lib/completion.ts와 동일 규칙)
export function pickLatestNodeIdsPerThread(nodes: ThreadNode[], limit: number): string[] {
  const archivedRoots = new Set<string>()
  for (const node of nodes) {
    if (node.rootConversationId === null && node.isArchived) archivedRoots.add(node.id)
  }
  const best = new Map<string, ThreadNode>()
  for (const node of nodes) {
    if (node.isArchived) continue // 개별 archived 노드 제외
    const key = node.rootConversationId ?? node.id
    if (archivedRoots.has(key)) continue // 완결 스레드 전체 제외
    const cur = best.get(key)
    if (!cur || new Date(node.updatedAt).getTime() > new Date(cur.updatedAt).getTime()) {
      best.set(key, node)
    }
  }
  return Array.from(best.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit)
    .map(node => node.id)
}
