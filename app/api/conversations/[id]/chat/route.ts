import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'
import { buildSystemPrompt, buildNovelSystemPrompt, matchLorebook } from '@/lib/systemPrompt'
import { streamChat } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import type { Message } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: '메시지 내용이 필요합니다.' }, { status: 400 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { include: { character: true } },
      messages: { where: { isSelected: true }, orderBy: { createdAt: 'asc' } },
      userPersona: true,
      lorebooks: true,
      memories: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const character = conv.characters[0]?.character
  if (!character) return NextResponse.json({ error: '캐릭터 정보가 없습니다.' }, { status: 400 })

  // Save user message
  const userMsg = await prisma.message.create({
    data: { conversationId: params.id, role: 'user', content, isSelected: true, parentId: null },
  })

  // Build system prompt
  const globalRulesConfig = await prisma.globalConfig.findUnique({ where: { key: 'global_rules' } })
  const globalRules = globalRulesConfig?.value ?? ''

  const recentMessages = conv.messages as unknown as Message[]
  const matchedLorebook = matchLorebook(
    conv.lorebooks.map(l => ({ ...l, keyword: l.keyword, content: l.content, priority: l.priority, scanDepth: l.scanDepth, isEnabled: l.isEnabled, scope: l.scope as 'conversation' | 'character', scopeId: l.scopeId, id: l.id })),
    recentMessages,
  )

  const promptParams = {
    character: {
      ...character,
      kind: 'custom' as const,
      safetyLevel: character.safetyLevel as 'strict' | 'standard' | 'relaxed',
      defaultAI: character.defaultAI as 'gemini' | 'claude' | 'chatgpt',
      tags: character.tags,
      avatarUrl: character.avatarUrl ?? undefined,
    },
    userPersona: conv.userPersona ? {
      id: conv.userPersona.id,
      name: conv.userPersona.name,
      description: conv.userPersona.description,
      additionalInfo: conv.userPersona.additionalInfo,
    } : null,
    coreMemory: conv.coreMemory,
    statusTimeline: conv.statusTimeline,
    lorebook: matchedLorebook,
    longTermMemory: conv.memories.map(m => m.summary),
    globalRules,
  }
  const systemPrompt = conv.mode === 'novel'
    ? buildNovelSystemPrompt(promptParams)
    : buildSystemPrompt(promptParams)

  // Build message history for AI
  const history = [...conv.messages, userMsg].map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }))

  // SSE streaming response
  const encoder = new TextEncoder()
  const abortController = new AbortController()
  req.signal.addEventListener('abort', () => abortController.abort())

  let assistantMsgId: string | null = null

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''
      try {
        await streamChat(
          {
            provider: conv.currentAI as 'gemini',
            systemPrompt,
            messages: history,
            temperature: character.temperature,
            frequencyPenalty: character.frequencyPenalty,
            safetyLevel: character.safetyLevel as 'strict' | 'standard' | 'relaxed',
          },
          chunk => {
            fullText += chunk
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
          },
          abortController.signal,
        )

        // Save assistant message
        const assistantMsg = await prisma.message.create({
          data: {
            conversationId: params.id,
            role: 'assistant',
            content: fullText || '[응답 없음]',
            aiModel: conv.currentAI,
            isSelected: true,
            parentId: null,
          },
        })
        assistantMsgId = assistantMsg.id

        await prisma.conversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

        triggerMemorySummarization(params.id, character.systemPrompt).catch(err =>
          console.error('[summarize] error:', err),
        )
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, messageId: assistantMsgId })}\n\n`))
      } catch (err: any) {
        console.error('[chat] AI error:', err)
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

async function authenticate(req: NextRequest) {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}
