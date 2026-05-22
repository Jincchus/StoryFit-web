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
  const userPrompt = `아래 대화를 3~5개의 핵심 사실 중심 불릿 포인트로 요약하세요. 이름·행동·장소·감정 변화만 포함하고, 추측하지 마세요.\n\n${transcript}`

  return generateText(systemPrompt, userPrompt)
}

export async function triggerMemorySummarization(
  conversationId: string,
  characterSystemPrompt: string,
): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isSummarizing: true },
  })
  if (!conv || conv.isSummarizing) return

  const totalMessages = await prisma.message.count({
    where: { conversationId, isSelected: true },
  })
  if (totalMessages % SUMMARIZE_EVERY !== 0) return

  const existingMemoryCount = await prisma.memory.count({ where: { conversationId } })
  const skipCount = existingMemoryCount * SUMMARIZE_EVERY

  const messages = await prisma.message.findMany({
    where: { conversationId, isSelected: true },
    orderBy: { createdAt: 'asc' },
    skip: skipCount,
    take: SUMMARIZE_EVERY,
  })
  if (messages.length < SUMMARIZE_EVERY) return

  await prisma.conversation.update({ where: { id: conversationId }, data: { isSummarizing: true } })

  try {
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
    await prisma.conversation.update({ where: { id: conversationId }, data: { isSummarizing: false } })
  }
}
