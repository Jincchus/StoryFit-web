import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { matchLorebook, replacePlaceholders } from '@/lib/systemPrompt'
import { stripAnalysisPreamble, deduplicatePreviousContent } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { triggerStoryEvaluation } from '@/lib/storyEval'
import { checkRateLimit } from '@/lib/rateLimit'
import { retrieveRelevantMemories } from '@/lib/ragMemory'
import { loadGlobalRules } from '@/lib/globalConfig'
import { getPersonalRulesForConv } from '@/lib/promptPresets'
import { parsePlotOutline, buildPlotSection } from '@/lib/plotOutline'
import { logAiError } from '@/lib/errorLog'
import { brokerStart, brokerFinish } from '@/lib/streamBroker'
import { applyLightFixes } from '@/lib/responseControl'
import {
  conversationContextInclude,
  buildCharParam,
  splitRecentAndOpening,
  buildModeSystemPrompt,
  buildGeminiHistory,
  streamToMessage,
  type GenConfig,
  type GeminiTurn,
} from '@/lib/chatPipeline'
import type { AIProvider } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  if (!checkRateLimit(userId)) return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const comebackElapsed: string | null = typeof body?.comeback?.elapsed === 'string' ? body.comeback.elapsed : null

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: conversationContextInclude,
  })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  if (conv.mode !== 'story' && conv.mode !== 'multiStory') {
    return NextResponse.json({ error: '스토리 모드에서만 사용할 수 있습니다.' }, { status: 400 })
  }
  const character = conv.characters[0]?.character
  if (!character) return NextResponse.json({ error: '캐릭터 정보가 없습니다.' }, { status: 400 })
  if (conv.messages.length === 0) return NextResponse.json({ error: '진행할 이야기가 없습니다.' }, { status: 400 })

  const lastContent = conv.messages[conv.messages.length - 1]?.content ?? ''
  const longTermMemory = await retrieveRelevantMemories(params.id, lastContent, 6).catch(err => { console.error('[ragMemory] 메모리 검색 실패:', err); return [] })

  const [{ globalRules, modeRules, closingRules }, personalRules] = await Promise.all([
    loadGlobalRules(conv.mode),
    getPersonalRulesForConv(userId, conv.mode),
  ])

  const matchedLorebook = matchLorebook(conv.lorebooks, conv.messages)

  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
  const mappedMessages = conv.messages.map(m => ({
    ...m,
    content: replacePlaceholders(m.content, personaName, character.name),
  }))
  const { recentMsgs, openingScene } = splitRecentAndOpening(mappedMessages)

  const plotOutline = parsePlotOutline(conv.plotOutline)
  const basePromptParams = {
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

  const systemPrompt = buildModeSystemPrompt({
    mode: conv.mode,
    base: basePromptParams,
    character: buildCharParam(character),
    characters: conv.characters.map((cc: any) => buildCharParam(cc.character)),
    statsConfig: conv.statsEnabled && Array.isArray(conv.statsConfig) ? conv.statsConfig as any : undefined,
    inventory: conv.inventoryEnabled && Array.isArray(conv.inventory) ? conv.inventory as any : undefined,
  })

  const instruction = comebackElapsed
    ? `[SYSTEM — 재회 인사]
${personaName}가 ${comebackElapsed} 만에 돌아왔다. 다음 규칙으로 짧게 응답하라.
- 캐릭터는 시간이 흐른 것을 자각하고 있다. 마지막 장면의 감정과 상황을 기억한 채, 시간 경과를 자연스럽게 반영해 먼저 말을 걸어라.
- 장면을 새로 전개하거나 사건을 일으키지 마라. 인사와 짧은 반응까지만.
- ${personaName}의 새로운 대사·행동·결정을 쓰지 마라.
- 선택지를 제시하지 마라. 분량은 평소의 절반 이하로 짧게.`
    : `[SYSTEM — 관전 모드]
사용자는 지금 개입하지 않고 이야기를 관전 중이다. 다음 규칙으로 이야기를 이어가라.
- 캐릭터들끼리 대화하고 행동하며 장면을 한 단계 진전시켜라. 새로운 사건이나 갈등을 일으켜도 좋다.
- ${personaName}의 새로운 대사·행동·결정을 쓰지 마라.
- 사용자에게 질문하거나 말을 걸지 마라.
- 선택지를 제시하지 마라. 본문 서술로만 끝내라.`

  const instructionMsg = { id: '__continue__', role: 'user', content: instruction }
  const history = buildGeminiHistory([...recentMsgs, instructionMsg], instructionMsg.id, false)

  const lastMsg = conv.messages[conv.messages.length - 1]
  const assistantMsg = await prisma.message.create({
    data: {
      conversationId: params.id,
      role: 'assistant',
      content: '',
      aiModel: conv.currentAI,
      isSelected: true,
      isStreaming: true,
      parentId: lastMsg.id,
    },
  })

  brokerStart(assistantMsg.id)

  continueAsync({
    convId: params.id,
    msgId: assistantMsg.id,
    userId,
    conv,
    character: buildCharParam(character),
    personaName,
    systemPrompt,
    history,
  }).catch(err => console.error('[continue:async] uncaught error:', err))

  return NextResponse.json({ messageId: assistantMsg.id }, { status: 202 })
}

async function continueAsync({
  convId, msgId, userId, conv, character, personaName, systemPrompt, history,
}: {
  convId: string
  msgId: string
  userId: string
  conv: any
  character: any
  personaName: string
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

    let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(state.fullText), prevAssistantText)
    cleanText = applyLightFixes(cleanText, {
      allowChoices: false,
      forbiddenChoiceNames: [],
      requiredBodyNames: [],
      personaName,
    })

    if (!cleanText) {
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'empty_response', inputTokens: result.inputTokens, outputTokens: result.outputTokens })
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
      brokerFinish(msgId, true)
      return
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

    triggerStoryEvaluation({
      convId,
      msgId,
      userMsg: '(관전 모드 자동 진행)',
      aiMsg: cleanText,
      currentTimeline: conv.statusTimeline ?? '',
      currentStats: Array.isArray(conv.statsConfig) ? conv.statsConfig as any : null,
      currentInventory: Array.isArray(conv.inventory) ? conv.inventory as any : null,
      statsEnabled: conv.statsEnabled && Array.isArray(conv.statsConfig) && conv.statsConfig.length > 0,
      inventoryEnabled: conv.inventoryEnabled && Array.isArray(conv.inventory),
      autoChapterEnabled: conv.autoChapterEnabled,
      plotOutline: parsePlotOutline(conv.plotOutline),
      currentChapter: conv.chapter,
    })
    brokerFinish(msgId)
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (state.fullText.trim()) {
      await prisma.message.update({
        where: { id: msgId },
        data: { content: state.fullText, isStreaming: false },
      }).catch(() => {})
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'partial_save', message: err?.message ?? String(err) })
      brokerFinish(msgId)
    } else {
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'api_error', statusCode: err?.status ?? 500, message: err?.message ?? String(err) })
      brokerFinish(msgId, true)
    }
  }
}
