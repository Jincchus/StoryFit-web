import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { streamChat, stripAnalysisPreamble, sliceByTokenBudget, type StreamChatParams, type StreamResult } from '@/lib/ai'
import { GEMINI_UTILITY_MODEL } from '@/lib/constants'
import { buildStorySystemPrompt, buildMultiStorySystemPrompt } from '@/lib/systemPrompt'
import { appendTurnControlInstruction, buildRevisionPrompt } from '@/lib/responseControl'
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

export function splitRecentAndOpening<M extends { id: string; role: string; content: string; parentId: string | null }>(
  messages: M[],
  budget = 5000,
): { recentMsgs: M[]; openingScene: string } {
  const recentMsgs = sliceByTokenBudget(messages, budget)
  const recentIds = new Set(recentMsgs.map(m => m.id))
  const openingScene = messages
    .filter(m => m.role === 'assistant' && !m.parentId && !recentIds.has(m.id))
    .map(m => m.content)
    .join('\n\n')
  return { recentMsgs, openingScene }
}

export function buildModeSystemPrompt({
  mode,
  base,
  character,
  characters,
  statsConfig,
  inventory,
}: {
  mode: string
  base: any
  character: any
  characters: any[]
  statsConfig?: { name: string; value: number; min: number; max: number }[]
  inventory?: { name: string; qty: number; description?: string }[]
}): string {
  if (mode === 'multiStory') return buildMultiStorySystemPrompt({ ...base, characters, statsConfig, inventory })
  return buildStorySystemPrompt({ ...base, character, statsConfig, inventory })
}

export function buildGeminiHistory(
  messages: { id: string; role: string; content: string }[],
  turnControlMsgId: string | undefined,
  allowChoices: boolean,
): GeminiTurn[] {
  return messages.reduce<GeminiTurn[]>((acc, m) => {
    const role = m.role === 'user' ? 'user' as const : 'model' as const
    const contentForModel = m.id === turnControlMsgId ? appendTurnControlInstruction(m.content, allowChoices) : m.content
    const last = acc[acc.length - 1]
    if (last && last.role === role) {
      last.parts[0].text += '\n\n' + contentForModel
    } else {
      acc.push({ role, parts: [{ text: contentForModel }] })
    }
    return acc
  }, [])
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

export async function streamRevision({
  gen,
  temperature,
  systemPrompt,
  history,
  firstDraft,
  revisionOptions,
  signal,
}: {
  gen: GenConfig
  temperature: number
  systemPrompt: string
  history: GeminiTurn[]
  firstDraft: string
  revisionOptions: Parameters<typeof buildRevisionPrompt>[1]
  signal: AbortSignal
}): Promise<string> {
  let revisedText = ''
  await streamChat(
    {
      ...gen,
      temperature,
      // 재작성은 '규칙 위반 수정' 작업이라 flash로 충분하며 지연을 크게 줄인다.
      // 출력은 클라이언트로 스트리밍하지 않고 완성본으로 교체되므로 thinking도 끈다.
      model: GEMINI_UTILITY_MODEL,
      thinkingBudget: 0,
      systemPrompt,
      messages: [
        ...history,
        { role: 'model', parts: [{ text: firstDraft }] },
        { role: 'user', parts: [{ text: buildRevisionPrompt(firstDraft, revisionOptions) }] },
      ],
    },
    chunk => { revisedText += chunk },
    signal,
  )
  return revisedText
}
