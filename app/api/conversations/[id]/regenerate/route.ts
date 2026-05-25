import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { buildSystemPrompt, buildNovelSystemPrompt, buildStorySystemPrompt, matchLorebook } from '@/lib/systemPrompt'
import { streamChat, stripAnalysisPreamble } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { retrieveRelevantMemories } from '@/lib/ragMemory'
import { loadGlobalRules } from '@/lib/globalConfig'
import type { Message } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

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

  const selectedMsgs = conv.messages
  const lastAssistant = [...selectedMsgs].reverse().find(m => m.role === 'assistant')
  const lastUserMsg = [...selectedMsgs].reverse().find(m => m.role === 'user')
  if (!lastAssistant) return NextResponse.json({ error: '재생성할 응답이 없습니다.' }, { status: 400 })

  const character = (lastAssistant.characterId
    ? conv.characters.find(cc => cc.character.id === lastAssistant.characterId)?.character
    : null) ?? conv.characters[0]?.character
  if (!character) return NextResponse.json({ error: '캐릭터 정보가 없습니다.' }, { status: 400 })

  await prisma.message.update({ where: { id: lastAssistant.id }, data: { isSelected: false } })

  const historyMsgs = selectedMsgs.filter(m => m.id !== lastAssistant.id)
  const longTermMemory = await retrieveRelevantMemories(params.id, lastUserMsg?.content ?? '', 6).catch(() => [])
  const { globalRules, modeRules } = await loadGlobalRules(conv.mode)

  const matchedLorebook = matchLorebook(
    conv.lorebooks.map(l => ({ ...l, scope: l.scope as 'conversation' | 'character' })),
    historyMsgs as unknown as Message[],
  )

  const charParam = {
    ...character,
    kind: 'custom' as const,
    safetyLevel: character.safetyLevel as 'strict' | 'standard' | 'relaxed',
    defaultAI: character.defaultAI as 'gemini' | 'claude' | 'chatgpt',
    avatarUrl: character.avatarUrl ?? undefined,
  }

  const promptParams = {
    character: charParam,
    personaCharacter: conv.personaCharacter ?? null,
    coreMemory: conv.coreMemory,
    statusTimeline: conv.statusTimeline,
    scenarioDescription: conv.scenarioDescription,
    lorebook: matchedLorebook,
    longTermMemory,
    globalRules,
    modeRules,
  }
  const systemPrompt = conv.mode === 'novel'
    ? buildNovelSystemPrompt(promptParams)
    : conv.mode === 'story'
      ? buildStorySystemPrompt(promptParams)
      : buildSystemPrompt(promptParams)

  const history = historyMsgs.slice(-15).map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }] as [{ text: string }],
  }))

  const newMsg = await prisma.message.create({
    data: {
      conversationId: params.id,
      role: 'assistant',
      content: '',
      aiModel: conv.currentAI,
      isSelected: true,
      isStreaming: true,
      parentId: lastAssistant.parentId,
    },
  })

  regenerateAsync({
    convId: params.id,
    msgId: newMsg.id,
    prevAssistantId: lastAssistant.id,
    character: charParam,
    conv,
    systemPrompt,
    history,
  }).catch(err => console.error('[regenerate:async] uncaught error:', err))

  return NextResponse.json({ messageId: newMsg.id }, { status: 202 })
}

async function regenerateAsync({
  convId, msgId, prevAssistantId, character, conv, systemPrompt, history,
}: {
  convId: string
  msgId: string
  prevAssistantId: string
  character: any
  conv: any
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
        provider: conv.currentAI as 'gemini',
        systemPrompt,
        messages: history,
        temperature: character.temperature,
        frequencyPenalty: character.frequencyPenalty,
        safetyLevel: character.safetyLevel as 'strict' | 'standard' | 'relaxed',
      },
      chunk => {
        fullText += chunk
        if (Date.now() - lastFlush > 2000) {
          prisma.message.update({ where: { id: msgId }, data: { content: fullText } }).catch(() => {})
          lastFlush = Date.now()
        }
      },
      bgAbort.signal,
    )
    clearTimeout(timeoutId)

    await prisma.message.update({
      where: { id: msgId },
      data: {
        content: stripAnalysisPreamble(fullText) || '[응답 없음]',
        isStreaming: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    })
    await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })

    triggerMemorySummarization(convId, [character.tags?.join(', '), character.additionalInfo].filter(Boolean).join('\n')).catch(() => {})
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (fullText.trim()) {
      await prisma.message.update({ where: { id: msgId }, data: { content: fullText, isStreaming: false } }).catch(() => {})
    } else {
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
      await prisma.message.update({ where: { id: prevAssistantId }, data: { isSelected: true } }).catch(() => {})
    }
  }
}
