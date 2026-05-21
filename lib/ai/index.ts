import type { AIProvider } from '@/types'
import { streamGeminiChat, type GeminiChatParams, type StreamResult } from './gemini'

export type StreamChatParams = GeminiChatParams & { provider: AIProvider }
export type { StreamResult }

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
