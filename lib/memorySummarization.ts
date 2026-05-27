import { prisma } from '@/lib/prisma'
import { generateText } from '@/lib/ai/gemini'
import { generateEmbedding } from '@/lib/embedding'

const SUMMARIZE_EVERY = 10

async function summarizeMessages(
  messages: { role: string; content: string }[],
  characterSystemPrompt: string,
): Promise<string> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? '유저' : '캐릭터'}: ${m.content}`)
    .join('\n')

  const systemPrompt = `당신은 롤플레이 대화 요약 도우미입니다. 캐릭터 설정: ${characterSystemPrompt}`
  const userPrompt = `아래 대화를 3~5개의 핵심 사실 중심 불릿 포인트로 요약하세요. 인물들의 외모, 의상(옷차림), 장소(위치) 변화 및 핵심 행동과 관계 변화를 반드시 포함하고, 추측하지 마세요. 반드시 한국어로 요약하세요.\n\n${transcript}`

  return generateText(systemPrompt, userPrompt)
}

export async function triggerMemorySummarization(
  conversationId: string,
  characterSystemPrompt: string,
): Promise<void> {
  // DB-level atomic lock to prevent concurrent summarization runs
  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, isSummarizing: false },
    data: { isSummarizing: true },
  })
  if (updated.count === 0) return // Already summarizing!

  try {
    const totalMessages = await prisma.message.count({
      where: { conversationId, isSelected: true },
    })
    const expectedCount = Math.floor(totalMessages / SUMMARIZE_EVERY)
    if (expectedCount === 0) return

    const existingMemoryCount = await prisma.memory.count({ where: { conversationId } })
    if (existingMemoryCount >= expectedCount) return

    const skipCount = existingMemoryCount * SUMMARIZE_EVERY
    const messages = await prisma.message.findMany({
      where: { conversationId, isSelected: true },
      orderBy: { createdAt: 'asc' },
      skip: skipCount,
      take: SUMMARIZE_EVERY,
    })
    if (messages.length < SUMMARIZE_EVERY) return

    const summary = await summarizeMessages(messages, characterSystemPrompt)
    const memory = await prisma.memory.create({
      data: {
        conversationId,
        summary,
        messageRangeStart: messages[0].id,
        messageRangeEnd: messages[messages.length - 1].id,
      },
    })

    generateEmbedding(summary).then(embedding => {
      const vector = `[${embedding.join(',')}]`
      return prisma.$executeRawUnsafe(
        `UPDATE "Memory" SET embedding = $1::vector WHERE id = $2`,
        vector,
        memory.id,
      )
    }).catch(err => console.error('[memorySummarization] embedding error:', err))
  } finally {
    // Release the DB lock
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { isSummarizing: false },
    }).catch(() => {})
  }
}

