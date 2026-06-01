import { prisma } from '@/lib/prisma'
import { generateEmbedding } from '@/lib/embedding'

export async function retrieveRelevantMemories(
  conversationId: string,
  queryText: string,
  topK = 6,
): Promise<string[]> {
  const totalMemories = await prisma.memory.count({ where: { conversationId } })
  if (totalMemories === 0) return []

  // 1. Fetch the 2 most recent memories chronologically to maintain transition context
  const recentMemories = await prisma.memory.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 2,
  })

  // 짧은 입력(인사말 등)은 임베딩 API 호출 스킵 → 최근 메모리만 반환
  if (queryText.trim().length < 15) {
    return recentMemories.map(m => m.summary).reverse()
  }

  let relevantMemories: { id: string; summary: string; createdAt: Date }[] = []

  try {
    const embedding = await generateEmbedding(queryText)
    const vector = `[${embedding.join(',')}]`

    // Query similar memories (fetch extra to account for potential duplicates with recentMemories)
    relevantMemories = await prisma.$queryRawUnsafe<{ id: string; summary: string; createdAt: Date }[]>(
      `SELECT id, summary, "createdAt" FROM "Memory"
       WHERE "conversationId" = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      conversationId,
      vector,
      topK + 2,
    )
  } catch (err) {
    console.error('[retrieveRelevantMemories] pgvector query error:', err)
  }

  // Fallback to recent-only if pgvector failed or returned nothing
  if (relevantMemories.length === 0) {
    const memories = await prisma.memory.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: topK,
    })
    return memories.map(m => m.summary).reverse()
  }

  // 2. Combine and de-duplicate using a Map
  const combinedMap = new Map<string, { id: string; summary: string; createdAt: Date }>()

  // Always include the most recent memories first
  for (const m of recentMemories) {
    combinedMap.set(m.id, { id: m.id, summary: m.summary, createdAt: m.createdAt })
  }

  // Fill up the rest of the topK slots with semantically relevant memories
  for (const m of relevantMemories) {
    if (combinedMap.size >= topK) break
    if (!combinedMap.has(m.id)) {
      combinedMap.set(m.id, m)
    }
  }

  // 3. Sort chronologically (oldest first, newest last) so the AI reads the story in order
  const sorted = Array.from(combinedMap.values()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )

  return sorted.map(m => m.summary)
}
