import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'
import { GEMINI_UTILITY_MODEL } from '@/lib/constants'

const SUMMARIZE_EVERY = 10

async function summarizeMessages(
  messages: { role: string; content: string }[],
  characterSystemPrompt: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: GEMINI_UTILITY_MODEL,
    tools: [],
    systemInstruction: `당신은 롤플레이 대화 요약 도우미입니다. 캐릭터 설정: ${characterSystemPrompt}`,
  })

  const transcript = messages
    .map(m => `${m.role === 'user' ? '유저' : '캐릭터'}: ${m.content}`)
    .join('\n')

  const prompt = `아래 대화를 3~5개의 핵심 사실 중심 불릿 포인트로 요약하세요. 이름·행동·장소·감정 변화만 포함하고, 추측하지 마세요.\n\n${transcript}`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
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
    await prisma.memory.create({
      data: {
        conversationId,
        summary,
        messageRangeStart: messages[0].id,
        messageRangeEnd: messages[messages.length - 1].id,
      },
    })
  } finally {
    await prisma.conversation.update({ where: { id: conversationId }, data: { isSummarizing: false } })
  }
}
