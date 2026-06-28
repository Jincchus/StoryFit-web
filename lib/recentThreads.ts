export type ThreadNode = { id: string; rootConversationId: string | null; updatedAt: Date | string }

// 스레드(rootConversationId ?? id)별로 updatedAt 최대 노드를 골라 updatedAt desc 정렬, 상위 limit개 id 반환.
export function pickLatestNodeIdsPerThread(nodes: ThreadNode[], limit: number): string[] {
  const best = new Map<string, ThreadNode>()
  for (const node of nodes) {
    const key = node.rootConversationId ?? node.id
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
