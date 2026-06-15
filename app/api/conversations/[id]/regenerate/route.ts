import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { matchLorebook, replacePlaceholders } from '@/lib/systemPrompt'
import type { InventoryItem, StatEntry } from '@/types'
import { stripAnalysisPreamble, deduplicatePreviousContent } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { triggerStoryEvaluation, triggerStateTracking, rollbackStatsDelta, rollbackInventoryDelta } from '@/lib/storyEval'
import { retrieveRelevantMemories } from '@/lib/ragMemory'
import { loadGlobalRules } from '@/lib/globalConfig'
import { getPersonalRulesForConv } from '@/lib/promptPresets'
import { parsePlotOutline, buildPlotSection } from '@/lib/plotOutline'
import { needsResponseRevision } from '@/lib/responseControl'
import { brokerStart, brokerFinish } from '@/lib/streamBroker'
import {
  conversationContextInclude,
  buildCharParam,
  splitRecentAndOpening,
  buildModeSystemPrompt,
  buildGeminiHistory,
  streamToMessage,
  streamRevision,
  type GenConfig,
  type GeminiTurn,
} from '@/lib/chatPipeline'
import type { AIProvider, Message } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: conversationContextInclude,
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
      await rollbackInventoryDelta(params.id, lastAssistantFull.inventoryDelta as any, conv.inventory as InventoryItem[]).catch(err => console.error('[regenerate] 인벤토리 롤백 실패:', err))
    }
    if (conv.statsEnabled && Array.isArray(conv.statsConfig) && conv.statsConfig.length > 0 && lastAssistantFull?.statsDelta) {
      await rollbackStatsDelta(params.id, lastAssistantFull.statsDelta as any, conv.statsConfig as StatEntry[]).catch(err => console.error('[regenerate] 스탯 롤백 실패:', err))
    }
  }

  const historyMsgs = selectedMsgs.filter(m => m.id !== lastAssistant.id)
  const longTermMemory = await retrieveRelevantMemories(params.id, lastUserMsg?.content ?? '', 6).catch(err => { console.error('[ragMemory] 메모리 검색 실패:', err); return [] })
  const [{ globalRules, modeRules, closingRules }, personalRules] = await Promise.all([
    loadGlobalRules(conv.mode),
    getPersonalRulesForConv(userId, conv.mode),
  ])

  const matchedLorebook = matchLorebook(conv.lorebooks, historyMsgs as unknown as Message[])

  const charParam = buildCharParam(character)

  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
  const charNames = conv.characters.map((cc: any) => cc.character.name)
  const mappedHistoryMsgs = historyMsgs.map(m => ({
    ...m,
    content: replacePlaceholders(m.content, personaName, charNames)
  }))

  const { recentMsgs: recentHistoryMsgs, openingScene } = splitRecentAndOpening(mappedHistoryMsgs)

  const plotOutline = parsePlotOutline(conv.plotOutline)
  const promptParams = {
    plotSection: plotOutline ? buildPlotSection(plotOutline, conv.chapter) : undefined,
    personaCharacter: conv.personaCharacter ?? null,
    coreMemory: conv.coreMemory,
    statusTimeline: conv.statusTimeline,
    scenarioDescription: conv.scenarioDescription,
    openingScene,
    lorebook: matchedLorebook,
    longTermMemory,
    globalRules,
    modeRules,
    closingRules,
    personalRules,
    styleConfig: (conv.styleConfig ?? null) as any,
  }
  const isMultiStory = conv.mode === 'multiStory'
  const freshConv = await prisma.conversation.findUnique({ where: { id: params.id }, select: { statsConfig: true, inventory: true } })

  const systemPrompt = buildModeSystemPrompt({
    mode: conv.mode,
    base: promptParams,
    character: charParam,
    characters: conv.characters.map((cc: any) => buildCharParam(cc.character)),
    statsConfig: conv.statsEnabled && Array.isArray(freshConv?.statsConfig) ? freshConv?.statsConfig as any : undefined,
    inventory: conv.inventoryEnabled && Array.isArray(freshConv?.inventory) ? freshConv?.inventory as any : undefined,
  })

  const latestUserId = [...mappedHistoryMsgs].reverse().find(m => m.role === 'user')?.id
  const allowChoices = false
  const history = buildGeminiHistory(recentHistoryMsgs, latestUserId, allowChoices)

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

  brokerStart(newMsg.id)

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
  history: GeminiTurn[]
}) {
  const prevAssistantText = [...history].reverse().find(m => m.role === 'model')?.parts[0].text ?? ''
  const gen: GenConfig = {
    provider: conv.currentAI as AIProvider,
    temperature: conv.temperature,
    frequencyPenalty: conv.frequencyPenalty,
    maxOutputTokens: conv.maxOutputTokens,
    thinkingBudget: conv.thinkingBudget,
    safetyLevel: conv.safetyLevel as 'strict' | 'standard' | 'relaxed',
  }
  const state = { fullText: '' }
  const bgAbort = new AbortController()
  const timeoutId = setTimeout(() => bgAbort.abort(), 5 * 60 * 1000)

  try {
    const result = await streamToMessage({ gen, systemPrompt, history, msgId, signal: bgAbort.signal, state })
    clearTimeout(timeoutId)

    let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(state.fullText), prevAssistantText) || '[응답 없음]'

    const revisionOptions = {
      allowChoices: false,
      forbiddenChoiceNames: [],
      requiredBodyNames: [],
      personaName: conv.personaCharacter?.name || conv.user?.displayName || '나',
    }

    if (needsResponseRevision(cleanText, revisionOptions)) {
      const revised = await streamRevision({
        gen,
        temperature: Math.min(Number(character.temperature ?? conv.temperature ?? 0.9), 0.75),
        systemPrompt,
        history,
        firstDraft: cleanText,
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

    triggerMemorySummarization(convId, [character.tags?.join(', '), character.additionalInfo].filter(Boolean).join('\n')).catch(err => console.error('[memorySummarization] trigger 실패:', err))

    if (conv.mode === 'story' || conv.mode === 'multiStory') {
      const freshConv2 = await prisma.conversation.findUnique({
        where: { id: convId },
        select: { statsConfig: true, inventory: true, statsEnabled: true, inventoryEnabled: true, statusTimeline: true },
      }).catch(() => null)
      if (freshConv2) {
        triggerStoryEvaluation({
          convId,
          msgId,
          userMsg: history[history.length - 1]?.parts[0].text ?? '',
          aiMsg: cleanText,
          currentTimeline: freshConv2.statusTimeline ?? '',
          currentStats: Array.isArray(freshConv2.statsConfig) ? freshConv2.statsConfig as any : null,
          currentInventory: Array.isArray(freshConv2.inventory) ? freshConv2.inventory as any : null,
          statsEnabled: freshConv2.statsEnabled && Array.isArray(freshConv2.statsConfig) && (freshConv2.statsConfig as any[]).length > 0,
          inventoryEnabled: freshConv2.inventoryEnabled && Array.isArray(freshConv2.inventory),
          autoChapterEnabled: conv.autoChapterEnabled,
          plotOutline: parsePlotOutline(conv.plotOutline),
          currentChapter: conv.chapter,
        })
      }
    } else {
      triggerStateTracking(convId, history[history.length - 1]?.parts[0].text ?? '', cleanText, conv.statusTimeline ?? '', conv.autoChapterEnabled)
    }
    brokerFinish(msgId)
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (state.fullText.trim()) {
      await prisma.message.update({ where: { id: msgId }, data: { content: state.fullText, isStreaming: false } }).catch(() => {})
      brokerFinish(msgId)
    } else {
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
      await prisma.message.update({ where: { id: prevAssistantId }, data: { isSelected: true } }).catch(() => {})
      brokerFinish(msgId, true)
    }
  }
}
