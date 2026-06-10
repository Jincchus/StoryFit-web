import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_CHAT_MODEL } from '@/lib/constants'
import type { GeminiChatParams, StreamResult } from './gemini'

export type ClaudeChatParams = GeminiChatParams

export class ClaudeRefusalError extends Error {
  constructor(message = 'Claude refused to generate a response') {
    super(message)
    this.name = 'ClaudeRefusalError'
  }
}

// 거절 여부 판단 전까지 응답을 보류하는 버퍼 크기 (글자 수)
const REFUSAL_BUFFER_LIMIT = 120

const REFUSAL_PATTERNS = [
  /죄송하지만/, /죄송합니다만/, /도와드릴 수 없/, /답변(을|드리기)?\s*드릴 수 없/,
  /작성(해|해드릴|할)\s*수\s*없/, /생성(해|해드릴|할)\s*수\s*없/, /응답(해|해드릴|할)\s*수\s*없/,
  /이 요청은?\s*도와드릴 수 없/, /부적절한 (콘텐츠|내용|요청)/, /제공할 수 없습니다/,
  /I can'?t (help|assist|continue|write|generate|create|provide)/i,
  /I('m| am) not able to/i,
  /I cannot (help|assist|continue|write|generate|create|provide)/i,
  /I'm sorry,? but I/i,
  /As an AI/i,
]

function looksLikeRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some(p => p.test(text))
}

export async function streamClaudeChat(
  params: ClaudeChatParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messages = params.messages.map(m => ({
    role: (m.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
    content: m.parts.map(p => p.text).join(''),
  }))

  const stream = client.messages.stream({
    model: CLAUDE_CHAT_MODEL,
    system: params.systemPrompt,
    messages,
    max_tokens: params.maxOutputTokens ?? 8192,
    temperature: params.temperature ?? 0.9,
  }, { signal })

  let fullText = ''
  let buffer = ''
  let flushed = false
  let refused = false

  stream.on('text', delta => {
    if (refused) return
    fullText += delta
    if (flushed) {
      onChunk(delta)
      return
    }
    buffer += delta
    if (looksLikeRefusal(buffer)) {
      refused = true
      return
    }
    if (buffer.length >= REFUSAL_BUFFER_LIMIT) {
      flushed = true
      onChunk(buffer)
    }
  })

  let finalMessage: Anthropic.Message
  try {
    finalMessage = await stream.finalMessage()
  } catch (err) {
    if (signal?.aborted) {
      if (!flushed && buffer && !looksLikeRefusal(buffer)) onChunk(buffer)
      return { text: fullText, inputTokens: 0, outputTokens: 0 }
    }
    throw err
  }

  if (refused || finalMessage.stop_reason === 'refusal' || (!flushed && looksLikeRefusal(buffer))) {
    throw new ClaudeRefusalError()
  }

  if (!flushed && buffer) onChunk(buffer)

  return {
    text: fullText,
    inputTokens: finalMessage.usage?.input_tokens ?? 0,
    outputTokens: finalMessage.usage?.output_tokens ?? 0,
  }
}
