import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { buildSystemPrompt, buildNovelSystemPrompt, buildStorySystemPrompt, matchLorebook } from '@/lib/systemPrompt'
import { streamChat, stripLeadingAnalysis } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { triggerStatsEvaluation } from '@/lib/statsEval'
import { triggerInventoryEvaluation } from '@/lib/inventoryEval'
import { checkRateLimit } from '@/lib/rateLimit'
import { retrieveRelevantMemories } from '@/lib/ragMemory'
import { loadGlobalRules } from '@/lib/globalConfig'
import { logAiError } from '@/lib/errorLog'
import type { AIProvider } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  if (!checkRateLimit(userId)) return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: '메시지 내용이 필요합니다.' }, { status: 400 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } },
      messages: { where: { isSelected: true, isStreaming: false }, orderBy: { createdAt: 'asc' } },
      personaCharacter: true,
      lorebooks: true,
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  if (conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const character = conv.characters[0]?.character
  if (!character) return NextResponse.json({ error: '캐릭터 정보가 없습니다.' }, { status: 400 })

  const longTermMemory = await retrieveRelevantMemories(params.id, content, 6).catch(() => [])

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

  const [{ globalRules, modeRules }, userRecord] = await Promise.all([
    loadGlobalRules(conv.mode),
    prisma.user.findUnique({ where: { id: userId }, select: { personalRules: true } }),
  ])

  const matchedLorebook = matchLorebook(
    conv.lorebooks.map(l => ({ ...l, scope: l.scope as 'conversation' | 'character' })),
    conv.messages,
  )

  const basePromptParams = {
    personaCharacter: conv.personaCharacter ?? null,
    coreMemory: conv.coreMemory,
    statusTimeline: conv.statusTimeline,
    scenarioDescription: conv.scenarioDescription,
    lorebook: matchedLorebook,
    longTermMemory,
    globalRules,
    modeRules,
    personalRules: userRecord?.personalRules ?? '',
  }

  function makeCharParam(c: typeof character) {
    return {
      ...c,
      kind: 'custom' as const,
      safetyLevel: c.safetyLevel as 'strict' | 'standard' | 'relaxed',
      defaultAI: c.defaultAI as 'gemini' | 'claude' | 'chatgpt',
      avatarUrl: c.avatarUrl ?? undefined,
    }
  }

  // tikiTaka는 SSE 유지 (다중 캐릭터 순차 스트림)
  if (conv.mode === 'tikiTaka') {
    const encoder = new TextEncoder()
    const abortController = new AbortController()
    req.signal.addEventListener('abort', () => abortController.abort())
    return streamTikiTaka({ conv, params, userMsg, basePromptParams, makeCharParam, encoder, abortController })
  }

  const systemPrompt = conv.mode === 'novel'
    ? buildNovelSystemPrompt({ ...basePromptParams, character: makeCharParam(character) })
    : conv.mode === 'story'
      ? buildStorySystemPrompt({ ...basePromptParams, character: makeCharParam(character) })
      : buildSystemPrompt({ ...basePromptParams, character: makeCharParam(character) })

  const recentMsgs = conv.messages.slice(-15)
  const history = [...recentMsgs, userMsg].reduce<{ role: 'user' | 'model'; parts: [{ text: string }] }[]>((acc, m) => {
    const role = m.role === 'user' ? 'user' as const : 'model' as const
    const last = acc[acc.length - 1]
    if (last && last.role === role && role === 'user') {
      last.parts[0].text += '\n\n' + m.content
    } else {
      acc.push({ role, parts: [{ text: m.content }] })
    }
    return acc
  }, [])

  // 스트리밍 플레이스홀더 메시지 생성
  const assistantMsg = await prisma.message.create({
    data: {
      conversationId: params.id,
      role: 'assistant',
      content: '',
      aiModel: conv.currentAI,
      isSelected: true,
      isStreaming: true,
      parentId: userMsg.id,
    },
  })

  // 백그라운드에서 AI 생성 (응답 즉시 반환)
  generateAsync({
    convId: params.id,
    msgId: assistantMsg.id,
    userId,
    conv,
    character: makeCharParam(character),
    systemPrompt,
    history,
  }).catch(err => console.error('[chat:async] uncaught error:', err))

  return NextResponse.json({ messageId: assistantMsg.id }, { status: 202 })
}

async function generateAsync({
  convId, msgId, userId, conv, character, systemPrompt, history,
}: {
  convId: string
  msgId: string
  userId: string
  conv: any
  character: any
  systemPrompt: string
  history: { role: 'user' | 'model'; parts: [{ text: string }] }[]
}) {
  let fullText = ''
  let lastFlush = Date.now()
  const bgAbort = new AbortController()
  const timeoutId = setTimeout(() => bgAbort.abort(), 5 * 60 * 1000)

  try {
    const result = await streamChat(
      {
        provider: conv.currentAI as AIProvider,
        systemPrompt,
        messages: history,
        temperature: conv.temperature,
        frequencyPenalty: conv.frequencyPenalty,
        safetyLevel: conv.safetyLevel as 'strict' | 'standard' | 'relaxed',
      },
      chunk => {
        fullText += chunk
        if (Date.now() - lastFlush > 2000) {
          prisma.message.update({ where: { id: msgId }, data: { content: stripLeadingAnalysis(fullText) } }).catch(() => {})
          lastFlush = Date.now()
        }
      },
      bgAbort.signal,
    )
    clearTimeout(timeoutId)

    if (!fullText) {
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'empty_response', inputTokens: result.inputTokens, outputTokens: result.outputTokens })
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
      return
    }

    await prisma.message.update({
      where: { id: msgId },
      data: {
        content: stripLeadingAnalysis(fullText),
        isStreaming: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    })
    await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })

    triggerMemorySummarization(convId, [character.tags?.join(', '), character.additionalInfo].filter(Boolean).join('\n')).catch(() => {})

    if (conv.mode === 'story' && conv.statsEnabled && Array.isArray(conv.statsConfig) && conv.statsConfig.length > 0) {
      triggerStatsEvaluation(convId, history[history.length - 1]?.parts[0].text ?? '', fullText, conv.statsConfig)
    }
    if (conv.mode === 'story' && conv.inventoryEnabled && Array.isArray(conv.inventory)) {
      triggerInventoryEvaluation(convId, history[history.length - 1]?.parts[0].text ?? '', fullText, conv.inventory)
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (fullText.trim()) {
      await prisma.message.update({
        where: { id: msgId },
        data: { content: stripLeadingAnalysis(fullText), isStreaming: false },
      }).catch(() => {})
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'partial_save', message: err?.message ?? String(err) })
    } else {
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'api_error', statusCode: err?.status ?? 500, message: err?.message ?? String(err) })
    }
  }
}

function buildGeminiHistory(
  messages: { role: string; content: string }[],
): Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> {
  const result: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = []
  for (const m of messages) {
    const role = m.role === 'user' ? 'user' as const : 'model' as const
    if (result.length > 0 && result[result.length - 1].role === 'model' && role === 'model') {
      result[result.length - 1].parts[0].text += '\n\n' + m.content
    } else {
      result.push({ role, parts: [{ text: m.content }] })
    }
  }
  const firstUser = result.findIndex(m => m.role === 'user')
  return firstUser >= 0 ? result.slice(firstUser) : []
}

async function streamTikiTaka({
  conv, params, userMsg, basePromptParams, makeCharParam, encoder, abortController,
}: {
  conv: any
  params: { id: string }
  userMsg: { id: string; content: string }
  basePromptParams: any
  makeCharParam: (c: any) => any
  encoder: TextEncoder
  abortController: AbortController
}) {
  const preTurnHistory = buildGeminiHistory(conv.messages.slice(-15))

  const stream = new ReadableStream({
    async start(controller) {
      const savedResponses: { id: string; charName: string; content: string }[] = []
      const safeEnqueue = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      try {
        for (const convChar of conv.characters) {
          if (abortController.signal.aborted) break
          const tChar = convChar.character
          const tSystemPrompt = buildSystemPrompt({ ...basePromptParams, character: makeCharParam(tChar) })

          const prevContext = savedResponses.length > 0
            ? '\n\n' + savedResponses.map(r => `[${r.charName}]\n${r.content}`).join('\n\n')
            : ''

          const messages = [
            ...preTurnHistory,
            { role: 'user' as const, parts: [{ text: userMsg.content + prevContext }] },
          ]

          let charText = ''
          safeEnqueue({ character: tChar.name, characterId: tChar.id })

          const tikiResult = await streamChat(
            {
              provider: conv.currentAI as AIProvider,
              systemPrompt: tSystemPrompt,
              messages,
              temperature: conv.temperature,
              frequencyPenalty: conv.frequencyPenalty,
              safetyLevel: conv.safetyLevel as 'strict' | 'standard' | 'relaxed',
            },
            chunk => {
              charText += chunk
              safeEnqueue({ character: tChar.name, characterId: tChar.id, text: chunk })
            },
            abortController.signal,
          )

          const parentId = savedResponses.length > 0
            ? savedResponses[savedResponses.length - 1].id
            : userMsg.id

          const charMsg = await prisma.message.create({
            data: {
              conversationId: params.id,
              role: 'assistant',
              content: charText || '[응답 없음]',
              aiModel: conv.currentAI,
              isSelected: true,
              parentId,
              characterId: tChar.id,
              inputTokens: tikiResult.inputTokens,
              outputTokens: tikiResult.outputTokens,
              createdAt: new Date(Date.now() + savedResponses.length * 100),
            },
          })

          savedResponses.push({ id: charMsg.id, charName: tChar.name, content: charText })
          safeEnqueue({ character: tChar.name, characterId: tChar.id, done: true, messageId: charMsg.id })
        }

        await prisma.conversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

        const firstChar = conv.characters[0]?.character
        if (firstChar) {
          triggerMemorySummarization(params.id, [firstChar.tags?.join(', '), firstChar.additionalInfo].filter(Boolean).join('\n')).catch(() => {})
        }

        safeEnqueue({ allDone: true })
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          const status = err?.status ?? 500
          let errorMsg = '응답 생성 중 오류가 발생했습니다. 다시 시도해주세요.'
          if (status === 503) errorMsg = 'AI 서버가 혼잡합니다. 잠시 후 다시 전송해주세요.'
          else if (status === 429) errorMsg = '요청이 너무 많습니다. 잠시 후 다시 전송해주세요.'
          const retryable = status === 429 || status === 503 || status >= 500
          safeEnqueue({ error: errorMsg, retryable })
        }
      } finally {
        try { controller.close() } catch {}
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
