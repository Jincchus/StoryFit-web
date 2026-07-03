import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { streamChat, stripAnalysisPreamble, approxTokens, type StreamChatParams, type StreamResult } from '@/lib/ai'
import { buildStorySystemPrompt, buildMultiStorySystemPrompt } from '@/lib/systemPrompt'
import { appendTurnControlInstruction } from '@/lib/responseControl'
import { brokerPublish } from '@/lib/streamBroker'
import type { AIProvider } from '@/types'

export const conversationContextInclude = {
  user: { select: { displayName: true } },
  characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } },
  messages: { where: { isSelected: true, isStreaming: false }, orderBy: { createdAt: 'asc' } },
  personaCharacter: true,
  lorebooks: true,
} satisfies Prisma.ConversationInclude

export type GeminiTurn = { role: 'user' | 'model'; parts: [{ text: string }] }
export type GenConfig = Omit<StreamChatParams, 'systemPrompt' | 'messages'>

export function buildCharParam<C extends { safetyLevel: string; defaultAI: string; avatarUrl?: string | null }>(c: C) {
  return {
    ...c,
    kind: 'custom' as const,
    safetyLevel: c.safetyLevel as 'strict' | 'standard' | 'relaxed',
    defaultAI: c.defaultAI as AIProvider,
    avatarUrl: c.avatarUrl ?? undefined,
  }
}

// 오프닝 장면 토큰 상한. 정상 대화는 오프닝이 1개라 한참 못 미치지만,
// 분기 parentId 손상 등으로 다수 메시지가 null parent가 되면 여기서 폭주를 막는다.
const OPENING_SCENE_TOKEN_CAP = 4000

// 히스토리 창을 매 턴 뒤에서부터 재슬라이스하면 창 시작점이 턴마다 밀려 implicit cache
// 프리픽스가 깨진다. 대신 앞에서부터 결정적으로 시뮬레이션: 누적이 high를 넘는 순간에만
// 창 시작을 low 이하로 전진시킨다. 히스토리는 append-only라 같은 절단점이 매 턴 재현되고,
// 절단이 일어나기 전까지 창 시작(=프리픽스)이 고정된다. 최소 창은 low로 기존 예산과 동일.
export function sliceStableWindow<T extends { content: string }>(
  messages: T[],
  lowBudget = 5000,
  highBudget = 9000,
  minMessages = 2,
): T[] {
  const tokens = messages.map(m => approxTokens(m.content))
  let start = 0
  let total = 0
  for (let i = 0; i < messages.length; i++) {
    total += tokens[i]
    if (total > highBudget) {
      while (total > lowBudget && i - start + 1 > minMessages) {
        total -= tokens[start]
        start++
      }
    }
  }
  return messages.slice(start)
}

export function splitRecentAndOpening<M extends { id: string; role: string; content: string; parentId: string | null }>(
  messages: M[],
): { recentMsgs: M[]; openingScene: string } {
  const recentMsgs = sliceStableWindow(messages)
  const recentIds = new Set(recentMsgs.map(m => m.id))
  const openingMsgs = messages.filter(
    m => m.role === 'assistant' && !m.parentId && !recentIds.has(m.id),
  )

  // 정상이면 오프닝은 앞쪽 소수 메시지뿐이다. 토큰 예산을 넘으면 데이터 손상 신호이므로
  // 앞에서부터 예산 안까지만 취하고 경고를 남긴다(이전 parentId 손상 분기 대비 방어).
  const openingParts: string[] = []
  let openingTokens = 0
  for (const m of openingMsgs) {
    const t = approxTokens(m.content)
    if (openingTokens + t > OPENING_SCENE_TOKEN_CAP && openingParts.length > 0) {
      console.warn(
        `[splitRecentAndOpening] openingScene 토큰 초과(${openingMsgs.length}개 null-parent assistant) — parentId 손상 의심, ${openingParts.length}개로 절단`,
      )
      break
    }
    openingParts.push(m.content)
    openingTokens += t
  }
  return { recentMsgs, openingScene: openingParts.join('\n\n') }
}

export function buildModeSystemPrompt({
  mode,
  base,
  character,
  characters,
  allowPersonaDialogue,
  flipPersonaPlaceholders,
  fastPace,
  adultGating,
}: {
  mode: string
  base: any
  character: any
  characters: any[]
  allowPersonaDialogue?: boolean
  flipPersonaPlaceholders?: boolean
  fastPace?: boolean
  adultGating?: boolean
}): string {
  if (mode === 'multiStory') return buildMultiStorySystemPrompt({ ...base, characters, allowPersonaDialogue, flipPersonaPlaceholders, fastPace, adultGating })
  return buildStorySystemPrompt({ ...base, character, allowPersonaDialogue, flipPersonaPlaceholders, fastPace, adultGating })
}

export function buildGeminiHistory(
  messages: { id: string; role: string; content: string }[],
  turnControlMsgId: string | undefined,
  allowChoices: boolean,
  enrichMode = false,
  stateBlock?: string,
): GeminiTurn[] {
  const turns = messages.reduce<GeminiTurn[]>((acc, m) => {
    const role = m.role === 'user' ? 'user' as const : 'model' as const
    const contentForModel = m.id === turnControlMsgId ? appendTurnControlInstruction(m.content, allowChoices, enrichMode) : m.content
    const last = acc[acc.length - 1]
    if (last && last.role === role) {
      last.parts[0].text += '\n\n' + contentForModel
    } else {
      acc.push({ role, parts: [{ text: contentForModel }] })
    }
    return acc
  }, [])

  // 가변 상태 블록(buildVolatileStateBlock)은 마지막 user 턴 맨 앞에 주입한다.
  // 시스템 프롬프트·앞선 히스토리를 바이트 고정으로 유지해 implicit cache에 적중시키면서,
  // 매 턴 바뀌는 상태는 생성 직전 위치(주의력 최상)에서 반영되게 한다.
  if (stateBlock?.trim()) {
    const lastUser = [...turns].reverse().find(t => t.role === 'user')
    if (lastUser) lastUser.parts[0].text = `${stateBlock}\n\n---\n\n${lastUser.parts[0].text}`
    else turns.push({ role: 'user', parts: [{ text: stateBlock }] })
  }
  return turns
}

export async function streamToMessage({
  gen,
  systemPrompt,
  history,
  msgId,
  signal,
  state,
}: {
  gen: GenConfig
  systemPrompt: string
  history: GeminiTurn[]
  msgId: string
  signal: AbortSignal
  state: { fullText: string }
}): Promise<StreamResult> {
  let lastFlush = Date.now()
  return streamChat(
    { ...gen, systemPrompt, messages: history },
    chunk => {
      state.fullText += chunk
      brokerPublish(msgId, chunk)
      if (Date.now() - lastFlush > 500) {
        prisma.message.update({ where: { id: msgId }, data: { content: stripAnalysisPreamble(state.fullText) } }).catch(() => {})
        lastFlush = Date.now()
      }
    },
    signal,
  )
}
