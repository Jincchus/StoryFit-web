import { prisma } from '@/lib/prisma'
import { generateEmbedding } from '@/lib/embedding'

export async function retrieveRelevantMemories(
  conversationId: string,
  queryText: string,
  topK = 5,
): Promise<string[]> {
  const totalMemories = await prisma.memory.count({ where: { conversationId } })
  if (totalMemories === 0) return []

  try {
    const embedding = await generateEmbedding(queryText)
    const vector = `[${embedding.join(',')}]`

    const results = await prisma.$queryRawUnsafe<{ summary: string }[]>(
      `SELECT summary FROM "Memory"
       WHERE "conversationId" = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      conversationId,
      vector,
      topK,
    )

    if (results.length > 0) return results.map(r => r.summary)
  } catch {
    // embedding 없는 경우 fallback
  }

  const memories = await prisma.memory.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: topK,
    select: { summary: true },
  })
  return memories.map(m => m.summary).reverse()
}
