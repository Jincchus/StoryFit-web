import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { SafetyLevel } from '@/types'
import { GEMINI_CHAT_MODEL } from '@/lib/constants'

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
}

export interface StreamResult { text: string; inputTokens: number; outputTokens: number }

async function streamViaApiKey(
  params: GeminiChatParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const generationConfig = {
    temperature: params.temperature ?? 0.9,
    maxOutputTokens: 8192,
  }
  const safetySettings = HARM_CATEGORIES.map(category => ({
    category,
    threshold: SAFETY_MAP[params.safetyLevel ?? 'standard'],
  }))

  const model = genAI.getGenerativeModel({
    model: GEMINI_CHAT_MODEL,
    systemInstruction: params.systemPrompt,
    generationConfig,
    safetySettings,
    tools: [],
  })

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

async function streamViaVertex(
  params: GeminiChatParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const { VertexAI, HarmCategory: VHC, HarmBlockThreshold: VHBT } = await import('@google-cloud/vertexai')

  const VERTEX_SAFETY_MAP = {
    strict:   VHBT.BLOCK_LOW_AND_ABOVE,
    standard: VHBT.BLOCK_MEDIUM_AND_ABOVE,
    relaxed:  VHBT.BLOCK_NONE,
  }

  const vertexAI = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
  })

  const model = vertexAI.getGenerativeModel({
    model: GEMINI_CHAT_MODEL,
    systemInstruction: params.systemPrompt,
    generationConfig: {
      temperature: params.temperature ?? 0.9,
      maxOutputTokens: 8192,
    },
    safetySettings: [
      VHC.HARM_CATEGORY_HARASSMENT,
      VHC.HARM_CATEGORY_HATE_SPEECH,
      VHC.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      VHC.HARM_CATEGORY_DANGEROUS_CONTENT,
    ].map(category => ({
      category,
      threshold: VERTEX_SAFETY_MAP[params.safetyLevel ?? 'standard'],
    })),
  })

  const rawHistory = params.messages.slice(0, -1)
  const firstUserIdx = rawHistory.findIndex(m => m.role === 'user')
  const history = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : []

  const chat = model.startChat({
    history: history.map(m => ({ role: m.role, parts: m.parts })),
  })

  const lastMessage = params.messages[params.messages.length - 1]
  const result = await chat.sendMessageStream(lastMessage.parts[0].text)

  let fullText = ''
  for await (const chunk of result.stream) {
    if (signal?.aborted) break
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    fullText += text
    if (text) onChunk(text)
  }

  let inputTokens = 0
  let outputTokens = 0
  try {
    const response = await result.response
    inputTokens = (response as any).usageMetadata?.promptTokenCount ?? 0
    outputTokens = (response as any).usageMetadata?.candidatesTokenCount ?? 0
  } catch {}

  return { text: fullText, inputTokens, outputTokens }
}

export async function streamGeminiChat(
  params: GeminiChatParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  if (process.env.GEMINI_PROVIDER === 'vertex') {
    return streamViaVertex(params, onChunk, signal)
  }
  return streamViaApiKey(params, onChunk, signal)
}
