import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { streamChat } from '@/lib/ai'
import { checkRateLimit } from '@/lib/rateLimit'
import type { AIProvider } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  if (!checkRateLimit(userId)) return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: '메시지 내용이 필요합니다.' }, { status: 400 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: { messages: { where: { isSelected: true }, orderBy: { createdAt: 'asc' } } },
  })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  if (conv.mode !== 'assistant') return NextResponse.json({ error: '잘못된 대화 모드입니다.' }, { status: 400 })

  const prevMsg = conv.messages[conv.messages.length - 1] ?? null

  const userMsg = await prisma.message.create({
    data: {
      conversationId: params.id,
      role: 'user',
      content,
      isSelected: true,
      parentId: prevMsg?.id ?? null,
    },
  })

  const history = [...conv.messages.slice(-20), userMsg].map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }))

  const encoder = new TextEncoder()
  const abortController = new AbortController()
  req.signal.addEventListener('abort', () => abortController.abort())

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''
      let inputTokens = 0
      let outputTokens = 0
      try {
        const result = await streamChat(
          {
            provider: conv.currentAI as AIProvider,
            systemPrompt: '',
            messages: history,
            temperature: conv.temperature,
            frequencyPenalty: 0,
            safetyLevel: 'standard',
          },
          chunk => {
            fullText += chunk
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
          },
          abortController.signal,
        )
        inputTokens = result.inputTokens
        outputTokens = result.outputTokens

        const assistantMsg = await prisma.message.create({
          data: {
            conversationId: params.id,
            role: 'assistant',
            content: fullText || '[응답 없음]',
            aiModel: conv.currentAI,
            isSelected: true,
            parentId: userMsg.id,
            inputTokens,
            outputTokens,
          },
        })

        await prisma.conversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, messageId: assistantMsg.id })}\n\n`))
      } catch (err: any) {
        console.error('[assistant] AI error:', err)
        const status = err?.status ?? 500
        let errorMsg = '응답 생성 중 오류가 발생했습니다. 다시 시도해주세요.'
        if (status === 503) errorMsg = 'AI 서버가 혼잡합니다. 잠시 후 다시 전송해주세요.'
        else if (status === 429) errorMsg = '요청이 너무 많습니다. 잠시 후 다시 전송해주세요.'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
