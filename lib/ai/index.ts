import type { AIProvider } from '@/types'
import { streamGeminiChat, type GeminiChatParams, type StreamResult } from './gemini'

export type StreamChatParams = GeminiChatParams & { provider: AIProvider }
export type { StreamResult }

const isKorean = (ch: string) => { const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 }

export function stripAnalysisPreamble(text: string): string {
  const lines = text.split('\n')
  const firstNonEmpty = lines.find(l => l.trim())
  if (firstNonEmpty && isKorean(firstNonEmpty.trim()[0])) return text

  for (let i = 0; i < lines.length; i++) {
    const nonSpace = lines[i].replace(/\s/g, '')
    if (nonSpace.length > 3 && [...nonSpace].filter(isKorean).length / nonSpace.length > 0.4) {
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
