import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { buildSystemPrompt, buildNovelSystemPrompt, buildStorySystemPrompt, buildMultiStorySystemPrompt, matchLorebook } from '@/lib/systemPrompt'
import type { InventoryItem, StatEntry } from '@/types'
import { streamChat, stripAnalysisPreamble, deduplicatePreviousContent, sliceByTokenBudget } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { triggerStoryEvaluation, triggerStateTracking, rollbackStatsDelta, rollbackInventoryDelta } from '@/lib/storyEval'
import { retrieveRelevantMemories } from '@/lib/ragMemory'
import { loadGlobalRules } from '@/lib/globalConfig'
import { getPersonalRulesForConv } from '@/lib/promptPresets'
import { appendTurnControlInstruction, buildRevisionPrompt, needsResponseRevision } from '@/lib/responseControl'
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

  const lastAssistantFull = await prisma.message.findUnique({
    where: { id: lastAssistant.id },
    select: { inventoryDelta: true, statsDelta: true },
  })
  await prisma.message.update({ where: { id: lastAssistant.id }, data: { isSelected: false } })

  if (conv.mode === 'story') {
    if (conv.inventoryEnabled && Array.isArray(conv.inventory) && lastAssistantFull?.inventoryDelta) {
      await rollbackInventoryDelta(params.id, lastAssistantFull.inventoryDelta as any, conv.inventory as InventoryItem[]).catch(() => {})
    }
    if (conv.statsEnabled && Array.isArray(conv.statsConfig) && conv.statsConfig.length > 0 && lastAssistantFull?.statsDelta) {
      await rollbackStatsDelta(params.id, lastAssistantFull.statsDelta as any, conv.statsConfig as StatEntry[]).catch(() => {})
    }
  }

  const historyMsgs = selectedMsgs.filter(m => m.id !== lastAssistant.id)
  const longTermMemory = await retrieveRelevantMemories(params.id, lastUserMsg?.content ?? '', 6).catch(() => [])
  const [{ globalRules, modeRules }, personalRules] = await Promise.all([
    loadGlobalRules(conv.mode),
    getPersonalRulesForConv(userId, conv.mode),
  ])

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

  const recentHistoryMsgs = sliceByTokenBudget(historyMsgs, 5000)
  const recentHistoryIds = new Set(recentHistoryMsgs.map(m => m.id))
  const openingScene = historyMsgs
    .filter(m => m.role === 'assistant' && !m.parentId && !recentHistoryIds.has(m.id))
    .map(m => m.content)
    .join('\n\n')

  const promptParams = {
    character: charParam,
    personaCharacter: conv.personaCharacter ?? null,
    coreMemory: conv.coreMemory,
    statusTimeline: conv.statusTimeline,
    scenarioDescription: conv.scenarioDescription,
    openingScene,
    lorebook: matchedLorebook,
    longTermMemory,
    globalRules,
    modeRules,
    personalRules,
    styleConfig: (conv.styleConfig ?? null) as any,
  }
  const isMultiStory = conv.mode === 'tikiTaka' || conv.mode === 'multiStory'
  const freshConv = (conv.mode === 'story' || isMultiStory)
    ? await prisma.conversation.findUnique({ where: { id: params.id }, select: { statsConfig: true, inventory: true } })
    : null

  const systemPrompt = conv.mode === 'novel'
    ? buildNovelSystemPrompt(promptParams)
    : conv.mode === 'story'
      ? buildStorySystemPrompt({
          ...promptParams,
          statsConfig: conv.statsEnabled && Array.isArray(freshConv?.statsConfig) ? freshConv.statsConfig as any : undefined,
          inventory: conv.inventoryEnabled && Array.isArray(freshConv?.inventory) ? freshConv.inventory as any : undefined,
        })
      : isMultiStory
        ? buildMultiStorySystemPrompt({
            ...promptParams,
            characters: conv.characters.map((cc: any) => ({
              ...cc.character,
              kind: 'custom' as const,
              safetyLevel: cc.character.safetyLevel as 'strict' | 'standard' | 'relaxed',
              defaultAI: cc.character.defaultAI as 'gemini' | 'claude' | 'chatgpt',
              avatarUrl: cc.character.avatarUrl ?? undefined,
            })),
            statsConfig: conv.statsEnabled && Array.isArray(freshConv?.statsConfig) ? freshConv.statsConfig as any : undefined,
            inventory: conv.inventoryEnabled && Array.isArray(freshConv?.inventory) ? freshConv.inventory as any : undefined,
          })
        : buildSystemPrompt(promptParams)

  const latestUserId = [...historyMsgs].reverse().find(m => m.role === 'user')?.id
  const allowChoices = conv.mode === 'story' || isMultiStory
  const history = recentHistoryMsgs.reduce<{ role: 'user' | 'model'; parts: [{ text: string }] }[]>((acc, m) => {
    const role = m.role === 'user' ? 'user' as const : 'model' as const
    const contentForModel = m.id === latestUserId ? appendTurnControlInstruction(m.content, allowChoices) : m.content
    const last = acc[acc.length - 1]
    if (last && last.role === role) {
      last.parts[0].text += '\n\n' + contentForModel
    } else {
      acc.push({ role, parts: [{ text: contentForModel }] })
    }
    return acc
  }, [])

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
  const prevAssistantText = [...history].reverse().find(m => m.role === 'model')?.parts[0].text ?? ''
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
        maxOutputTokens: conv.maxOutputTokens,
        thinkingBudget: conv.thinkingBudget,
        safetyLevel: character.safetyLevel as 'strict' | 'standard' | 'relaxed',
      },
      chunk => {
        fullText += chunk
        if (Date.now() - lastFlush > 500) {
          prisma.message.update({ where: { id: msgId }, data: { content: stripAnalysisPreamble(fullText) } }).catch(() => {})
          lastFlush = Date.now()
        }
      },
      bgAbort.signal,
    )
    clearTimeout(timeoutId)

    let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(fullText), prevAssistantText) || '[응답 없음]'

    const revisionOptions = {
      allowChoices: conv.mode === 'story',
      forbiddenChoiceNames: conv.mode === 'story' ? [character.name] : [],
      requiredBodyNames: conv.mode === 'story' ? [character.name] : [],
      personaName: conv.personaCharacter?.name ?? '유저',
    }

    if (needsResponseRevision(cleanText, revisionOptions)) {
      const revised = await regenerateControlledResponse({
        conv,
        systemPrompt,
        history,
        firstDraft: cleanText,
        character,
        revisionOptions,
        signal: bgAbort.signal,
      }).catch(() => '')
      if (revised.trim()) cleanText = deduplicatePreviousContent(stripAnalysisPreamble(revised), prevAssistantText) || cleanText
    }

    await prisma.message.update({
      where: { id: msgId },
      data: {
        content: cleanText,
        isStreaming: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    })
    await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })

    triggerMemorySummarization(convId, [character.tags?.join(', '), character.additionalInfo].filter(Boolean).join('\n')).catch(() => {})

    const isMultiStory = conv.mode === 'tikiTaka' || conv.mode === 'multiStory'
    if (conv.mode === 'story') {
      const freshConv2 = await prisma.conversation.findUnique({
        where: { id: convId },
        select: { statsConfig: true, inventory: true, statsEnabled: true, inventoryEnabled: true },
      }).catch(() => null)
      if (freshConv2) {
        triggerStoryEvaluation({
          convId,
          msgId,
          userMsg: history[history.length - 1]?.parts[0].text ?? '',
          aiMsg: cleanText,
          currentStats: Array.isArray(freshConv2.statsConfig) ? freshConv2.statsConfig as any : null,
          currentInventory: Array.isArray(freshConv2.inventory) ? freshConv2.inventory as any : null,
          statsEnabled: freshConv2.statsEnabled && Array.isArray(freshConv2.statsConfig) && (freshConv2.statsConfig as any[]).length > 0,
          inventoryEnabled: freshConv2.inventoryEnabled && Array.isArray(freshConv2.inventory),
        })
      }
    } else if (!isMultiStory) {
      triggerStateTracking(convId, history[history.length - 1]?.parts[0].text ?? '', cleanText, conv.statusTimeline ?? '')
    }
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

async function regenerateControlledResponse({
  conv, systemPrompt, history, firstDraft, character, revisionOptions, signal,
}: {
  conv: any
  systemPrompt: string
  history: { role: 'user' | 'model'; parts: [{ text: string }] }[]
  firstDraft: string
  character: any
  revisionOptions: { allowChoices: boolean; forbiddenChoiceNames: string[]; requiredBodyNames: string[] }
  signal: AbortSignal
}): Promise<string> {
  let revisedText = ''
  await streamChat(
    {
      provider: conv.currentAI as 'gemini',
      systemPrompt,
      messages: [
        ...history,
        { role: 'model', parts: [{ text: firstDraft }] },
        { role: 'user', parts: [{ text: buildRevisionPrompt(firstDraft, revisionOptions) }] },
      ],
      temperature: Math.min(Number(character.temperature ?? 0.9), 0.75),
      frequencyPenalty: character.frequencyPenalty,
      maxOutputTokens: conv.maxOutputTokens,
      thinkingBudget: conv.thinkingBudget,
      safetyLevel: character.safetyLevel as 'strict' | 'standard' | 'relaxed',
    },
    chunk => { revisedText += chunk },
    signal,
  )
  return revisedText
}
