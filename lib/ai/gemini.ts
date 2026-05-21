import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { SafetyLevel } from '@/types'

const SAFETY_MAP: Record<SafetyLevel, HarmBlockThreshold> = {
  strict:   HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  standard: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  relaxed:  HarmBlockThreshold.BLOCK_ONLY_HIGH,
}

const HARM_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
]

export interface GeminiChatParams {
  systemPrompt: string
  messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
  temperature?: number
  frequencyPenalty?: number
  safetyLevel?: SafetyLevel
  cacheId?: string
}

export async function createGeminiCache(
  systemPrompt: string,
): Promise<{ name: string; expiry: Date } | null> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const cache = await (genAI as any).caches.create({
      model: 'models/gemini-2.5-flash',
      systemInstruction: systemPrompt,
      ttl: '3600s',
    })
    const expiry = cache.expireTime ? new Date(cache.expireTime) : new Date(Date.now() + 3_600_000)
    return { name: cache.name as string, expiry }
  } catch {
    return null
  }
}

export interface StreamResult { text: string; inputTokens: number; outputTokens: number }

export async function streamGeminiChat(
  params: GeminiChatParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

  const generationConfig = {
    temperature: params.temperature ?? 0.9,
    maxOutputTokens: 2048,
  }
  const safetySettings = HARM_CATEGORIES.map(category => ({
    category,
    threshold: SAFETY_MAP[params.safetyLevel ?? 'standard'],
  }))

  let model
  if (params.cacheId) {
    try {
      const cachedContent = await (genAI as any).caches.get(params.cacheId)
      model = (genAI as any).getGenerativeModelFromCachedContent(cachedContent, { generationConfig, safetySettings })
    } catch {
      model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: params.systemPrompt,
        generationConfig,
        safetySettings,
        tools: [],
      })
    }
  } else {
    model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: params.systemPrompt,
      generationConfig,
      safetySettings,
      tools: [],
    })
  }

  const rawHistory = params.messages.slice(0, -1)
  const firstUserIdx = rawHistory.findIndex(m => m.role === 'user')
  const history = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : []

  const chat = model.startChat({ history })
  const lastMessage = params.messages[params.messages.length - 1]
  const result = await chat.sendMessageStream(lastMessage.parts[0].text)

  let fullText = ''
  for await (const chunk of result.stream) {
    if (signal?.aborted) break
    const text = chunk.text()
    fullText += text
    onChunk(text)
  }

  let inputTokens = 0
  let outputTokens = 0
  try {
    const response = await result.response
    inputTokens = response.usageMetadata?.promptTokenCount ?? 0
    outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0
  } catch {}

  return { text: fullText, inputTokens, outputTokens }
}
