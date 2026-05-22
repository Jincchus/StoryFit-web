import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'
import { GEMINI_UTILITY_MODEL } from '@/lib/constants'

const EXTRACT_EVERY = 10

export async function triggerAutoCoreMemory(
  conversationId: string,
  characterName: string,
  characterSystemPrompt: string,
): Promise<void> {
  const totalMessages = await prisma.message.count({
    where: { conversationId, isSelected: true },
  })
  if (totalMessages % EXTRACT_EVERY !== 0) return

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { coreMemory: true, isSummarizing: true },
  })
  if (!conv || conv.isSummarizing) return

  const messages = await prisma.message.findMany({
    where: { conversationId, isSelected: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  if (messages.length === 0) return

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: GEMINI_UTILITY_MODEL })

  const transcript = [...messages].reverse()
    .map(m => `${m.role === 'user' ? '유저' : characterName}: ${m.content}`)
    .join('\n')

  const hasExisting = conv.coreMemory?.trim().length > 0

  const prompt = `캐릭터 설정: ${characterSystemPrompt}

최근 대화:
${transcript}

위 대화에서 절대 잊으면 안 되는 새로운 사실만 추출하세요.
규칙:
- 중요한 사실, 관계 변화, 감정 상태, 핵심 설정만 포함
- 불릿 포인트(- ) 형식, 최대 5개
- 대화에서 명확히 드러난 사실만 포함하고 추측 금지
- 새로 추가할 내용이 없으면 "(없음)"만 출력`

  try {
    const result = await model.generateContent(prompt)
    const newFacts = result.response.text().trim()
    if (!newFacts || newFacts === '(없음)') return

    const updated = hasExisting
      ? `${conv.coreMemory.trim()}\n${newFacts}`
      : newFacts

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { coreMemory: updated },
    })
  } catch (err) {
    console.error('[autoCoreMemory] error:', err)
  }
}
