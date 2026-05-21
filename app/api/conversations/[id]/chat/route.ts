import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'
import { buildSystemPrompt, buildNovelSystemPrompt, matchLorebook } from '@/lib/systemPrompt'
import { streamChat } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { triggerAutoCoreMemory } from '@/lib/autoCoreMemory'
import type { Message } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: '메시지 내용이 필요합니다.' }, { status: 400 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } },
      messages: { where: { isSelected: true }, orderBy: { createdAt: 'asc' } },
      userPersona: true,
      lorebooks: true,
      memories: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const character = conv.characters[0]?.character
  if (!character) return NextResponse.json({ error: '캐릭터 정보가 없습니다.' }, { status: 400 })

  const lastSelectedMsg = conv.messages[conv.messages.length - 1] ?? null

  const userMsg = await prisma.message.create({
    data: {
      conversationId: params.id,
      role: 'user',
      content,
      isSelected: true,
      parentId: lastSelectedMsg?.id ?? null,
    },
  })

  const [globalRulesConfig, modeRulesConfig] = await Promise.all([
    prisma.globalConfig.findUnique({ where: { key: 'global_rules' } }),
    prisma.globalConfig.findUnique({ where: { key: conv.mode === 'novel' ? 'novel_rules' : 'roleplay_rules' } }),
  ])
  const globalRules = globalRulesConfig?.value ?? ''
  const modeRules = modeRulesConfig?.value ?? ''

  const recentMessages = conv.messages as unknown as Message[]
  const matchedLorebook = matchLorebook(
    conv.lorebooks.map(l => ({ ...l, keyword: l.keyword, content: l.content, priority: l.priority, scanDepth: l.scanDepth, isEnabled: l.isEnabled, scope: l.scope as 'conversation' | 'character', scopeId: l.scopeId, id: l.id })),
    recentMessages,
  )

  const basePromptParams = {
    userPersona: conv.userPersona ? {
      id: conv.userPersona.id,
      name: conv.userPersona.name,
      description: conv.userPersona.description,
      additionalInfo: conv.userPersona.additionalInfo,
    } : null,
    coreMemory: conv.coreMemory,
    statusTimeline: conv.statusTimeline,
    scenarioDescription: conv.scenarioDescription,
    lorebook: matchedLorebook,
    longTermMemory: conv.memories.slice(-8).map(m => m.summary),
    globalRules,
    modeRules,
  }

  function makeCharParam(c: typeof character) {
    return {
      ...c,
      kind: 'custom' as const,
      safetyLevel: c.safetyLevel as 'strict' | 'standard' | 'relaxed',
      defaultAI: c.defaultAI as 'gemini' | 'claude' | 'chatgpt',
      tags: c.tags,
      avatarUrl: c.avatarUrl ?? undefined,
    }
  }

  const encoder = new TextEncoder()
  const abortController = new AbortController()
  req.signal.addEventListener('abort', () => abortController.abort())

  if (conv.mode === 'tikiTaka') {
    return streamTikiTaka({
      conv, params, userMsg, basePromptParams, makeCharParam, encoder, abortController,
    })
  }

  const systemPrompt = conv.mode === 'novel'
    ? buildNovelSystemPrompt({ ...basePromptParams, character: makeCharParam(character) })
    : buildSystemPrompt({ ...basePromptParams, character: makeCharParam(character) })

  const recentMsgs = conv.messages.slice(-15)
  const history = [...recentMsgs, userMsg].map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }))

  let assistantMsgId: string | null = null

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''
      let inputTokens = 0
      let outputTokens = 0
      try {
        const result = await streamChat(
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
        assistantMsgId = assistantMsg.id

        await prisma.conversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

        triggerMemorySummarization(params.id, character.systemPrompt).catch(err =>
          console.error('[summarize] error:', err),
        )
        triggerAutoCoreMemory(params.id, character.name, character.systemPrompt).catch(err =>
          console.error('[autoCoreMemory] error:', err),
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

      try {
        for (const convChar of conv.characters) {
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ character: tChar.name, characterId: tChar.id })}\n\n`))

          const tikiResult = await streamChat(
            {
              provider: conv.currentAI as 'gemini',
              systemPrompt: tSystemPrompt,
              messages,
              temperature: tChar.temperature,
              frequencyPenalty: tChar.frequencyPenalty,
              safetyLevel: tChar.safetyLevel as 'strict' | 'standard' | 'relaxed',
            },
            chunk => {
              charText += chunk
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ character: tChar.name, characterId: tChar.id, text: chunk })}\n\n`))
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
            },
          })

          savedResponses.push({ id: charMsg.id, charName: tChar.name, content: charText })
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ character: tChar.name, characterId: tChar.id, done: true, messageId: charMsg.id })}\n\n`))
        }

        await prisma.conversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

        const firstChar = conv.characters[0]?.character
        if (firstChar) {
          triggerMemorySummarization(params.id, firstChar.systemPrompt).catch(() => {})
          triggerAutoCoreMemory(params.id, firstChar.name, firstChar.systemPrompt).catch(() => {})
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ allDone: true })}\n\n`))
      } catch (err: any) {
        console.error('[tikiTaka] AI error:', err)
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
