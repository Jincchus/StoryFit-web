import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '@/lib/prisma'

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const transcript = [...messages].reverse()
    .map(m => `${m.role === 'user' ? '유저' : characterName}: ${m.content}`)
    .join('\n')

  const prompt = `캐릭터 설정: ${characterSystemPrompt}

기존 핵심 메모리:
${conv.coreMemory?.trim() || '(없음)'}

최근 대화:
${transcript}

위 대화를 분석해서 핵심 메모리를 업데이트하세요.
규칙:
- 중요한 사실, 관계 변화, 감정 상태, 핵심 설정만 포함
- 기존 핵심 메모리와 합쳐서 중복 없이 하나의 목록으로
- 불릿 포인트(- ) 형식, 최대 10개
- 대화에서 명확히 드러난 사실만 포함하고 추측 금지`

  try {
    const result = await model.generateContent(prompt)
    const extracted = result.response.text().trim()
    if (extracted) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { coreMemory: extracted },
      })
    }
  } catch (err) {
    console.error('[autoCoreMemory] error:', err)
  }
}
