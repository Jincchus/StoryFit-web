import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { buildSystemPrompt, buildNovelSystemPrompt, buildStorySystemPrompt, buildMultiStorySystemPrompt, matchLorebook } from '@/lib/systemPrompt'
import { streamChat, stripAnalysisPreamble, deduplicatePreviousContent, sliceByTokenBudget } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { triggerStoryEvaluation, triggerStateTracking } from '@/lib/storyEval'
import { checkRateLimit } from '@/lib/rateLimit'
import { retrieveRelevantMemories } from '@/lib/ragMemory'
import { loadGlobalRules } from '@/lib/globalConfig'
import { getPersonalRulesForConv } from '@/lib/promptPresets'
import { logAiError } from '@/lib/errorLog'
import { appendTurnControlInstruction, buildRevisionPrompt, needsResponseRevision } from '@/lib/responseControl'
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

  // ── 커맨드 처리 (예: !상태창) ──────────────────────────────────────────
  if (content.trim() === '!상태창') {
    const prevMsg = conv.messages[conv.messages.length - 1] ?? null
    
    // 유저가 보낸 '!상태창' 메시지 저장
    const userMsg = await prisma.message.create({
      data: {
        conversationId: params.id,
        role: 'user',
        content: content.trim(),
        isSelected: true,
        parentId: prevMsg?.id ?? null,
      },
    })

    // 상태창 텍스트 조립
    let statusContent = '### 📊 현재 상태창\n\n'
    
    if (conv.statsEnabled && Array.isArray(conv.statsConfig) && conv.statsConfig.length > 0) {
      statusContent += '| 스탯명 | 수치 | 상태 |\n| :--- | :---: | :--- |\n'
      for (const stat of conv.statsConfig as any) {
        const pct = Math.round(((stat.value - stat.min) / (stat.max - stat.min)) * 100)
        let gauge = '░░░░░░░░░░'
        const filledCount = Math.round(pct / 10)
        gauge = '▓'.repeat(filledCount) + '░'.repeat(10 - filledCount)
        statusContent += `| **${stat.name}** | ${stat.value} / ${stat.max} | \`${gauge}\` (${pct}%) |\n`
      }
    } else {
      statusContent += '*활성화된 관계/능력치 스탯이 없습니다.*\n'
    }

    statusContent += '\n### 🎒 소지품 (인벤토리)\n\n'
    if (conv.inventoryEnabled && Array.isArray(conv.inventory) && conv.inventory.length > 0) {
      statusContent += '| 아이템명 | 수량 | 설명 |\n| :--- | :---: | :--- |\n'
      for (const item of conv.inventory as any) {
        statusContent += `| **${item.name}** | ${item.qty}개 | ${item.description || '-'} |\n`
      }
    } else {
      statusContent += '*소지품이 없거나 인벤토리가 비활성화되어 있습니다.*\n'
    }
    
    if (conv.statusTimeline) {
      statusContent += `\n### 🎬 현재 상황\n${conv.statusTimeline}\n`
    }

    // 시스템이 만든 상태창 답변을 assistant 역할로 즉시 저장
    const assistantMsg = await prisma.message.create({
      data: {
        conversationId: params.id,
        role: 'assistant',
        content: statusContent,
        aiModel: 'system',
        isSelected: true,
        isStreaming: false,
        parentId: userMsg.id,
      },
    })

    return NextResponse.json({ messageId: assistantMsg.id }, { status: 200 })
  }
  // ────────────────────────────────────────────────────────────────────────

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

  const [{ globalRules, modeRules, closingRules }, personalRules] = await Promise.all([
    loadGlobalRules(conv.mode),
    getPersonalRulesForConv(userId, conv.mode),
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
    closingRules,
    personalRules,
    styleConfig: (conv.styleConfig ?? null) as any,
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

  const isMultiStory = conv.mode === 'tikiTaka' || conv.mode === 'multiStory'

  const systemPrompt = conv.mode === 'novel'
    ? buildNovelSystemPrompt({ ...basePromptParams, character: makeCharParam(character) })
    : conv.mode === 'story'
      ? buildStorySystemPrompt({
          ...basePromptParams,
          character: makeCharParam(character),
          statsConfig: conv.statsEnabled && Array.isArray(conv.statsConfig) ? conv.statsConfig as any : undefined,
          inventory: conv.inventoryEnabled && Array.isArray(conv.inventory) ? conv.inventory as any : undefined,
        })
      : isMultiStory
        ? buildMultiStorySystemPrompt({
            ...basePromptParams,
            characters: conv.characters.map((cc: any) => makeCharParam(cc.character)),
            statsConfig: conv.statsEnabled && Array.isArray(conv.statsConfig) ? conv.statsConfig as any : undefined,
            inventory: conv.inventoryEnabled && Array.isArray(conv.inventory) ? conv.inventory as any : undefined,
          })
        : buildSystemPrompt({ ...basePromptParams, character: makeCharParam(character) })

  const recentMsgs = sliceByTokenBudget(conv.messages, 5000)
  const allowChoices = conv.mode === 'story' || isMultiStory
  const history = [...recentMsgs, userMsg].reduce<{ role: 'user' | 'model'; parts: [{ text: string }] }[]>((acc, m) => {
    const role = m.role === 'user' ? 'user' as const : 'model' as const
    const contentForModel = m.id === userMsg.id ? appendTurnControlInstruction(m.content, allowChoices) : m.content
    const last = acc[acc.length - 1]
    if (last && last.role === role) {
      last.parts[0].text += '\n\n' + contentForModel
    } else {
      acc.push({ role, parts: [{ text: contentForModel }] })
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
  const prevAssistantText = [...history].reverse().find(m => m.role === 'model')?.parts[0].text ?? ''
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
        maxOutputTokens: conv.maxOutputTokens,
        thinkingBudget: conv.thinkingBudget,
        safetyLevel: conv.safetyLevel as 'strict' | 'standard' | 'relaxed',
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

    let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(fullText), prevAssistantText)

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
      if (revised.trim()) cleanText = deduplicatePreviousContent(stripAnalysisPreamble(revised), prevAssistantText)
    }

    if (!cleanText) {
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'empty_response', inputTokens: result.inputTokens, outputTokens: result.outputTokens })
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
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

    triggerMemorySummarization(convId, [character.tags?.join(', '), character.additionalInfo].filter(Boolean).join('\n')).catch(() => {})

    const isMultiStory = conv.mode === 'tikiTaka' || conv.mode === 'multiStory'
    if (conv.mode === 'story' || isMultiStory) {
      triggerStoryEvaluation({
        convId,
        msgId,
        userMsg: history[history.length - 1]?.parts[0].text ?? '',
        aiMsg: cleanText,
        currentStats: Array.isArray(conv.statsConfig) ? conv.statsConfig as any : null,
        currentInventory: Array.isArray(conv.inventory) ? conv.inventory as any : null,
        statsEnabled: conv.statsEnabled && Array.isArray(conv.statsConfig) && conv.statsConfig.length > 0,
        inventoryEnabled: conv.inventoryEnabled && Array.isArray(conv.inventory),
      })
    } else {
      triggerStateTracking(convId, history[history.length - 1]?.parts[0].text ?? '', cleanText, conv.statusTimeline ?? '')
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (fullText.trim()) {
      await prisma.message.update({
        where: { id: msgId },
        data: { content: fullText, isStreaming: false },
      }).catch(() => {})
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'partial_save', message: err?.message ?? String(err) })
    } else {
      await prisma.message.delete({ where: { id: msgId } }).catch(() => {})
      logAiError({ userId, conversationId: convId, provider: conv.currentAI, mode: conv.mode, errorType: 'api_error', statusCode: err?.status ?? 500, message: err?.message ?? String(err) })
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
      provider: conv.currentAI as AIProvider,
      systemPrompt,
      messages: [
        ...history,
        { role: 'model', parts: [{ text: firstDraft }] },
        { role: 'user', parts: [{ text: buildRevisionPrompt(firstDraft, revisionOptions) }] },
      ],
      temperature: Math.min(Number(character.temperature ?? conv.temperature ?? 0.9), 0.75),
      frequencyPenalty: conv.frequencyPenalty,
      maxOutputTokens: conv.maxOutputTokens,
      thinkingBudget: conv.thinkingBudget,
      safetyLevel: conv.safetyLevel as 'strict' | 'standard' | 'relaxed',
    },
    chunk => { revisedText += chunk },
    signal,
  )
  return revisedText
}

function buildGeminiHistory(
  messages: { role: string; content: string }[],
): Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> {
  const result: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = []
  for (const m of messages) {
    const role = m.role === 'user' ? 'user' as const : 'model' as const
    if (result.length > 0 && result[result.length - 1].role === role) {
      result[result.length - 1].parts[0].text += '\n\n' + m.content
    } else {
      result.push({ role, parts: [{ text: m.content }] })
    }
  }
  const firstUser = result.findIndex(m => m.role === 'user')
  return firstUser >= 0 ? result.slice(firstUser) : []
}
