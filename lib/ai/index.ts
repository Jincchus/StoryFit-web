import type { AIProvider } from '@/types'
import { streamGeminiChat, type GeminiChatParams, type StreamResult } from './gemini'

export type StreamChatParams = GeminiChatParams & { provider: AIProvider }
export type { StreamResult }

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
    case 'gemini':
      return streamGeminiChat(params, onChunk, signal)
    default:
      return streamGeminiChat(params, onChunk, signal)
  }
}
