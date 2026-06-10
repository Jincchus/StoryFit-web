import type { AIProvider } from '@/types'
import { streamGeminiChat, type GeminiChatParams, type StreamResult } from './gemini'
import { streamClaudeChat, ClaudeRefusalError } from './claude'

export type StreamChatParams = GeminiChatParams & { provider: AIProvider }
export type { StreamResult }

// 한글 2토큰, 그 외 0.25토큰 근사치
export function approxTokens(text: string): number {
  let tokens = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    tokens += code >= 0xAC00 && code <= 0xD7A3 ? 2 : 0.25
  }
  return Math.ceil(tokens)
}

// 메시지 배열을 뒤에서부터 토큰 예산 안에서 슬라이스
// minMessages: 예산 초과해도 최소 보장할 메시지 수
export function sliceByTokenBudget<T extends { content: string }>(
  messages: T[],
  budget: number,
  minMessages = 2,
): T[] {
  let total = 0
  let start = messages.length
  while (start > 0) {
    const tokens = approxTokens(messages[start - 1].content)
    if (total + tokens > budget && messages.length - start >= minMessages) break
    total += tokens
    start--
  }
  return messages.slice(start)
}

export function deduplicatePreviousContent(newText: string, prevText: string): string {
  if (!prevText?.trim() || !newText?.trim()) return newText
  const newLines = newText.split('\n')
  const prevSet = new Set(
    prevText.split('\n').map(l => l.trim()).filter(l => l.length > 15)
  )
  // 앞에서부터 연속으로 이전 응답과 일치하는 줄만 제거
  // 새로운 줄이 나오면 즉시 중단 (중간에 흩어진 매칭은 무시)
  let cutIdx = 0
  let repeatStreak = 0
  for (let i = 0; i < Math.min(newLines.length, 30); i++) {
    const line = newLines[i].trim()
    if (line.length < 15) continue
    if (prevSet.has(line)) {
      repeatStreak++
      cutIdx = i + 1
    } else {
      break // 새로운 줄이 나오면 즉시 중단
    }
  }
  if (repeatStreak >= 2) {
    const remaining = newLines.slice(cutIdx).join('\n').trimStart()
    return remaining || newText
  }
  return newText
}

export function stripAnalysisPreamble(text: string): string {
  const lines = text.split('\n')
  const firstNonEmpty = lines.find(l => l.trim())
  if (firstNonEmpty && /^[가-힣]/.test(firstNonEmpty.trim())) return text

  for (let i = 0; i < lines.length; i++) {
    const nonSpace = lines[i].replace(/\s/g, '')
    if (nonSpace.length > 3 && (nonSpace.match(/[가-힣]/g) ?? []).length / nonSpace.length > 0.4) {
      return lines.slice(i).join('\n')
    }
  }
  return text
}

export async function streamChat(
  params: StreamChatParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  switch (params.provider) {
    case 'claude':
      try {
        return await streamClaudeChat(params, onChunk, signal)
      } catch (err) {
        if (err instanceof ClaudeRefusalError) {
          return streamGeminiChat(params, onChunk, signal)
        }
        throw err
      }
    case 'gemini':
      return streamGeminiChat(params, onChunk, signal)
    default:
      return streamGeminiChat(params, onChunk, signal)
  }
}
