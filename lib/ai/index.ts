import type { AIProvider } from '@/types'
import { streamGeminiChat, type GeminiChatParams, type StreamResult } from './gemini'

export type StreamChatParams = GeminiChatParams & { provider: AIProvider }
export type { StreamResult }

export function deduplicatePreviousContent(newText: string, prevText: string): string {
  if (!prevText?.trim() || !newText?.trim()) return newText
  const newLines = newText.split('\n')
  const prevSet = new Set(
    prevText.split('\n').map(l => l.trim()).filter(l => l.length > 10)
  )
  let lastRepeatIdx = -1
  let consecutiveNew = 0
  for (let i = 0; i < Math.min(newLines.length, 40); i++) {
    const line = newLines[i].trim()
    if (line.length < 10) continue
    if (prevSet.has(line)) {
      lastRepeatIdx = i
      consecutiveNew = 0
    } else {
      consecutiveNew++
      if (consecutiveNew >= 3) break
    }
  }
  if (lastRepeatIdx >= 0) {
    const remaining = newLines.slice(lastRepeatIdx + 1).join('\n').trimStart()
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
    case 'gemini':
      return streamGeminiChat(params, onChunk, signal)
    default:
      throw new Error(`AI provider '${params.provider}' is not available in v1`)
  }
}
