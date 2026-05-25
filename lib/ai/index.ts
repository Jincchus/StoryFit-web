import type { AIProvider } from '@/types'
import { streamGeminiChat, type GeminiChatParams, type StreamResult } from './gemini'

export type StreamChatParams = GeminiChatParams & { provider: AIProvider }
export type { StreamResult }

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
