import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { matchLorebook, replacePlaceholders } from '@/lib/systemPrompt'
import { stripAnalysisPreamble, deduplicatePreviousContent } from '@/lib/ai'
import { triggerMemorySummarization } from '@/lib/memorySummarization'
import { triggerStoryEvaluation, triggerStateTracking } from '@/lib/storyEval'
import { checkRateLimit } from '@/lib/rateLimit'
import { retrieveRelevantMemories } from '@/lib/ragMemory'
import { loadGlobalRules } from '@/lib/globalConfig'
import { getPersonalRulesForConv } from '@/lib/promptPresets'
import { parsePlotOutline, buildPlotSection } from '@/lib/plotOutline'
import { parseCommand, isBuiltinCommand, builtinFallbackKey, BUILTIN_FALLBACK, composeCommandDirective } from '@/lib/commands'
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

interface DiceResult {
  statName: string | null
  statValue: number
  roll: number
  outcome: '대성공' | '성공' | '실패' | '대실패'
}

function rollDice(statName: string | null, statValue: number): DiceResult {
  const roll = Math.floor(Math.random() * 100) + 1
  const outcome: DiceResult['outcome'] =
    roll >= 96 ? '대실패'
    : roll <= Math.max(1, Math.ceil(statValue / 5)) ? '대성공'
    : roll <= statValue ? '성공'
    : '실패'
  return { statName, statValue, roll, outcome }
}

const DICE_GUIDES: Record<DiceResult['outcome'], string> = {
  대성공: '행동이 기대 이상으로 성공한다. 인상적인 성과나 뜻밖의 보상을 서사에 반영하라.',
  성공: '행동은 성공한다. 단, 서사적 긴장감이나 작은 대가는 유지해도 좋다.',
  실패: '행동은 실패한다. 실패의 대가, 새로운 위기, 또는 상황 악화를 만들어라. 실패를 미화하거나 우회 성공시키지 마라.',
  대실패: '행동이 치명적으로 실패하며 상황이 명백히 악화된다. 예상치 못한 부작용을 일으켜라.',
}

function diceTag(d: DiceResult): string {
  const label = d.statName ? `${d.statName}(${d.statValue}) · 주사위 ${d.roll}` : `주사위 ${d.roll}`
  return `🎲 판정 — ${label} → ${d.outcome}`
}

function diceInstruction(d: DiceResult): string {
  return `\n\n[SYSTEM — 판정 결과: ${d.outcome}]\n- 이 판정 결과는 최종이다. 절대 뒤집거나 무시하지 마라.\n- ${DICE_GUIDES[d.outcome]}`
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  if (!checkRateLimit(userId)) return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })

  const { content, dice } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: '메시지 내용이 필요합니다.' }, { status: 400 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: conversationContextInclude,
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  if (conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const character = conv.characters[0]?.character
  if (!character) return NextResponse.json({ error: '캐릭터 정보가 없습니다.' }, { status: 400 })

  // 커맨드 → AI 생성 경로에서 쓸 값(빌트인 폴백/커스텀). null이면 일반 채팅.
  let commandDirective: string | null = null
  let commandTagName: string | null = null

  // ── 커맨드 처리 (확장형 커맨드 엔진) ──────────────────────────────────────
  const trimmedInput = content.trim()
  const parsedCmd = parseCommand(trimmedInput)
  if (parsedCmd) {
    const cmd = parsedCmd.name.toLowerCase()
    let replyText: string | null = null // 결정적 즉시 응답. null이면 AI 생성 경로.

    if (isBuiltinCommand(parsedCmd.name)) {
      commandTagName = parsedCmd.name
      // 1) 결정적 빌트인 출력 시도(데이터 있을 때). 빈 데이터면 det=null → 폴백.
      const det = buildBuiltinReply(cmd, conv)
      if (det !== null) {
        replyText = det
      } else {
        // 2) 빈 상태계 커맨드 → AI 폴백
        const fk = builtinFallbackKey(parsedCmd.name)
        if (fk) {
          const extra = parsedCmd.args ? `\n추가 지시: ${parsedCmd.args}` : ''
          commandDirective = `[시스템 커맨드: ${parsedCmd.name}]\n${BUILTIN_FALLBACK[fk]}${extra}\n\n응답은 마크다운 형식으로 작성하라.`
        } else {
          replyText = '*표시할 정보가 없습니다.*'
        }
      }
    } else {
      // 3) 커스텀 커맨드 조회
      const uc = await prisma.userCommand.findUnique({
        where: { userId_name: { userId, name: parsedCmd.name } },
      })
      if (uc) {
        commandTagName = parsedCmd.name
        commandDirective = composeCommandDirective(parsedCmd.name, uc.instruction, parsedCmd.args)
      } else {
        commandTagName = parsedCmd.name
        replyText = `⚠️ **알 수 없는 명령어입니다.**\n사용 가능한 명령어를 보려면 **\`!도움말\`**을 입력해 주세요.`
      }
    }

    // 결정적 즉시 응답 경로
    if (replyText !== null) {
      const prevMsg = conv.messages[conv.messages.length - 1] ?? null
      const userMsg = await prisma.message.create({
        data: { conversationId: params.id, role: 'user', content: trimmedInput, chapter: conv.chapter, isSelected: true, parentId: prevMsg?.id ?? null },
      })
      const assistantMsg = await prisma.message.create({
        data: { conversationId: params.id, role: 'assistant', content: replyText, aiModel: 'system', chapter: conv.chapter, isSelected: true, isStreaming: false, parentId: userMsg.id, commandName: commandTagName },
      })
      return NextResponse.json({ messageId: assistantMsg.id }, { status: 200 })
    }
    // 그 외(commandDirective != null): early-return 없이 아래 일반 생성 흐름으로 진행.
  }
  // ────────────────────────────────────────────────────────────────────────

  // RAG 메모리 검색(임베딩 생성 + 벡터검색)을 먼저 시작해 아래 DB 작업과 병렬로 돌린다 → 첫 토큰까지 지연 단축
  const longTermMemoryPromise = retrieveRelevantMemories(params.id, content, 6).catch(err => { console.error('[ragMemory] 메모리 검색 실패:', err); return [] })

  let diceResult: DiceResult | null = null
  if (dice && (conv.mode === 'story' || conv.mode === 'multiStory')) {
    const statName = typeof dice.stat === 'string' ? dice.stat.trim() : ''
    const stats = Array.isArray(conv.statsConfig) ? conv.statsConfig as { name: string; value: number }[] : []
    const found = statName ? stats.find(s => s.name === statName) : null
    diceResult = rollDice(found?.name ?? null, found?.value ?? 50)
  }

  const prevMsg = conv.messages[conv.messages.length - 1] ?? null
  const [userMsg, { globalRules, modeRules, closingRules }, personalRules, longTermMemory] = await Promise.all([
    prisma.message.create({
      data: {
        conversationId: params.id,
        role: 'user',
        content: diceResult ? `${content}\n\n${diceTag(diceResult)}` : content,
        chapter: conv.chapter,
        isSelected: true,
        parentId: prevMsg?.id ?? null,
      },
    }),
    loadGlobalRules(conv.mode),
    getPersonalRulesForConv(userId, conv.mode),
    longTermMemoryPromise,
  ])

  const matchedLorebook = matchLorebook(conv.lorebooks, conv.messages)

  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
  const charNames = conv.characters.map((cc: any) => cc.character.name)
  const mappedMessages = conv.messages.map(m => ({
    ...m,
    content: replacePlaceholders(m.content, personaName, charNames)
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
    allowPersonaDialogue: conv.personaAutoMode ?? false,
    flipPersonaPlaceholders: conv.personaFlipPlaceholders ?? true,
    fastPace: conv.fastPaceEnabled ?? false,
    adultGating: conv.adultGatingEnabled ?? true,
  })

  const finalSystemPrompt = commandDirective ? `${systemPrompt}\n\n${commandDirective}` : systemPrompt

  const isCommandGen = commandDirective != null

  const enrichMode = conv.enrichInputMode ?? false
  // 스토리/멀티스토리 모드면 항상 본문에 4지선다 포함 — 단일 호출로 본문+선택지를 함께 생성
  // (별도 /suggestions API 호출 없이 클라이언트가 본문에서 파싱해 버튼으로 렌더)
  // 커맨드 생성은 4지선다 제외 — 마크다운 응답과 충돌 방지
  const allowChoices = (conv.mode === 'story' || conv.mode === 'multiStory') && !isCommandGen
  const cleanUserMsgContent = replacePlaceholders(userMsg.content, personaName, charNames)
    + (diceResult ? diceInstruction(diceResult) : '')
  const history = buildGeminiHistory([...recentMsgs, { ...userMsg, content: cleanUserMsgContent }], userMsg.id, allowChoices, enrichMode)

  // 스트리밍 플레이스홀더 메시지 생성
  const assistantMsg = await prisma.message.create({
    data: {
      conversationId: params.id,
      role: 'assistant',
      content: '',
      aiModel: conv.currentAI,
      chapter: conv.chapter,
      isSelected: true,
      isStreaming: true,
      parentId: userMsg.id,
      commandName: commandTagName,
    },
  })

  brokerStart(assistantMsg.id)

  // 백그라운드에서 AI 생성 (응답 즉시 반환)
  generateAsync({
    convId: params.id,
    msgId: assistantMsg.id,
    userId,
    conv,
    character: buildCharParam(character),
    systemPrompt: finalSystemPrompt,
    history,
    isCommandGen,
  }).catch(err => console.error('[chat:async] uncaught error:', err))

  return NextResponse.json({ messageId: assistantMsg.id }, { status: 202 })
}

async function generateAsync({
  convId, msgId, userId, conv, character, systemPrompt, history, isCommandGen,
}: {
  convId: string
  msgId: string
  userId: string
  conv: any
  character: any
  systemPrompt: string
  history: GeminiTurn[]
  isCommandGen: boolean
}) {
  const prevAssistantText = [...history].reverse().find(m => m.role === 'model')?.parts[0].text ?? ''
  const gen: GenConfig = {
    provider: conv.currentAI as AIProvider,
    model: conv.chatModel || undefined,
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

    const allowChoices = (conv.mode === 'story' || conv.mode === 'multiStory') && !isCommandGen
    cleanText = applyLightFixes(cleanText, allowChoices)

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

    if (!isCommandGen) {
      if (conv.mode === 'story' || conv.mode === 'multiStory') {
        triggerStoryEvaluation({
          convId,
          msgId,
          userMsg: history[history.length - 1]?.parts[0].text ?? '',
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
      } else {
        triggerStateTracking(convId, history[history.length - 1]?.parts[0].text ?? '', cleanText, conv.statusTimeline ?? '', conv.autoChapterEnabled)
      }
    }
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

function getStatsMarkdown(statsConfig: any, enabled: boolean): string {
  if (enabled && Array.isArray(statsConfig) && statsConfig.length > 0) {
    let md = '| 스탯명 | 수치 | 상태 |\n| :--- | :---: | :--- |\n'
    for (const stat of statsConfig) {
      const pct = Math.round(((stat.value - stat.min) / (stat.max - stat.min)) * 100)
      const filledCount = Math.round(pct / 10)
      const gauge = '▓'.repeat(filledCount) + '░'.repeat(10 - filledCount)
      md += `| **${stat.name}** | ${stat.value} / ${stat.max} | \`${gauge}\` (${pct}%) |\n`
    }
    return md
  }
  return '*활성화된 관계/능력치 스탯이 없습니다.*\n'
}

function getInventoryMarkdown(inventory: any, enabled: boolean): string {
  if (enabled && Array.isArray(inventory) && inventory.length > 0) {
    let md = '| 아이템명 | 수량 | 설명 |\n| :--- | :---: | :--- |\n'
    for (const item of inventory) {
      md += `| **${item.name}** | ${item.qty}개 | ${item.description || '-'} |\n`
    }
    return md
  }
  return '*소지품이 없거나 인벤토리가 비활성화되어 있습니다.*\n'
}

function isStatsEmpty(conv: any): boolean {
  return !conv.statsEnabled || !Array.isArray(conv.statsConfig) || conv.statsConfig.length === 0
}
function isInventoryEmpty(conv: any): boolean {
  return !conv.inventoryEnabled || !Array.isArray(conv.inventory) || conv.inventory.length === 0
}
function isSceneEmpty(conv: any): boolean {
  return !conv.statusTimeline || !String(conv.statusTimeline).trim()
}

// 결정적 빌트인 출력. 상태계는 데이터 없으면 null(→ AI 폴백). 도움말/알수없음은 항상 문자열.
function buildBuiltinReply(cmd: string, conv: any): string | null {
  if (cmd === '상태창' || cmd === '정보' || cmd === 'status') {
    if (isStatsEmpty(conv) && isInventoryEmpty(conv) && isSceneEmpty(conv)) return null
    let t = '### 📊 현재 상태창\n\n'
    t += getStatsMarkdown(conv.statsConfig, conv.statsEnabled)
    t += '\n### 🎒 소지품 (인벤토리)\n\n'
    t += getInventoryMarkdown(conv.inventory, conv.inventoryEnabled)
    if (conv.statusTimeline) t += `\n### 🎬 현재 상황\n${conv.statusTimeline}\n`
    return t
  }
  if (cmd === '스탯' || cmd === '능력치' || cmd === 'stats' || cmd === '호감도' || cmd === '관계') {
    if (isStatsEmpty(conv)) return null
    return '### 📊 능력치 및 관계 스탯\n\n' + getStatsMarkdown(conv.statsConfig, conv.statsEnabled)
  }
  if (cmd === '인벤토리' || cmd === '소지품' || cmd === '인벤' || cmd === 'inventory') {
    if (isInventoryEmpty(conv)) return null
    return '### 🎒 소지품 (인벤토리)\n\n' + getInventoryMarkdown(conv.inventory, conv.inventoryEnabled)
  }
  if (cmd === '상황' || cmd === '씬' || cmd === 'scene' || cmd === '타임라인') {
    if (isSceneEmpty(conv)) return null
    return '### 🎬 현재 씬 상황\n\n' + conv.statusTimeline
  }
  if (cmd === '도움말' || cmd === '명령어' || cmd === 'help') {
    return `### ⚙️ StoryFit 시스템 명령어 도움말

대화창에 아래 명령어를 입력하면 AI 비용 없이 즉시 게임 정보를 조회할 수 있습니다.

* **\`!상태창\`** (또는 \`!정보\`) : 스탯, 인벤토리, 현재 상황을 모두 보여줍니다.
* **\`!스탯\`** (또는 \`!호감도\`, \`!관계\`) : 캐릭터와의 관계 및 스탯만 확인합니다.
* **\`!인벤토리\`** (또는 \`!소지품\`) : 가방 속 아이템 목록을 보여줍니다.
* **\`!상황\`** (또는 \`!타임라인\`) : 현재 씬의 시간대, 장소, 의상 등의 상황 요약을 봅니다.
* **\`!도움말\`** : 이 명령어 매뉴얼을 불러옵니다.

> 💡 설정창의 **내 커맨드**에서 나만의 AI 커맨드(예: \`!에타\`)를 만들 수 있습니다.`
  }
  return '⚠️ **알 수 없는 명령어입니다.**'
}
