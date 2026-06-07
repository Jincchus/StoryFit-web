import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { SafetyLevel } from '@/types'
import { GEMINI_CHAT_MODEL, GEMINI_UTILITY_MODEL } from '@/lib/constants'

const SAFETY_MAP: Record<SafetyLevel, HarmBlockThreshold> = {
  strict:   HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  standard: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  relaxed:  HarmBlockThreshold.BLOCK_NONE,
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
  maxOutputTokens?: number
  thinkingBudget?: number
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
    frequencyPenalty: params.frequencyPenalty ?? 0.3,
    maxOutputTokens: params.maxOutputTokens ?? 8192,
    thinkingConfig: { thinkingBudget: params.thinkingBudget ?? 0 },
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
    const parts: any[] = (chunk as any).candidates?.[0]?.content?.parts ?? []
    const text = parts.filter(p => !p.thought).map(p => p.text ?? '').join('')
    if (text) { fullText += text; onChunk(text) }
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
  const { GoogleGenAI } = await import('@google/genai')

  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
  })

  const rawHistory = params.messages.slice(0, -1)
  const firstUserIdx = rawHistory.findIndex(m => m.role === 'user')
  const history = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : []

  const chat = ai.chats.create({
    model: GEMINI_CHAT_MODEL,
    history: history.map(m => ({ role: m.role, parts: m.parts })),
    config: {
      systemInstruction: params.systemPrompt,
      temperature: params.temperature ?? 0.9,
      frequencyPenalty: params.frequencyPenalty ?? 0.3,
      maxOutputTokens: params.maxOutputTokens ?? 8192,
      thinkingConfig: { thinkingBudget: params.thinkingBudget ?? 0 },
    },
  })

  const lastMessage = params.messages[params.messages.length - 1]
  const stream = await chat.sendMessageStream({ message: lastMessage.parts[0].text })

  let fullText = ''
  let inputTokens = 0
  let outputTokens = 0

  for await (const chunk of stream) {
    if (signal?.aborted) break
    const parts: any[] = (chunk as any).candidates?.[0]?.content?.parts ?? []
    const text = parts.length
      ? parts.filter(p => !p.thought).map(p => p.text ?? '').join('')
      : (chunk.text ?? '')
    if (text) { fullText += text; onChunk(text) }
    if (chunk.usageMetadata) {
      inputTokens = chunk.usageMetadata.promptTokenCount ?? 0
      outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0
    }
  }

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

export async function generateText(systemPrompt: string, userPrompt: string, maxOutputTokens = 1024): Promise<string> {
  const utilConfig = { maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } }
  if (process.env.GEMINI_PROVIDER === 'vertex') {
    const { VertexAI } = await import('@google-cloud/vertexai')
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT!,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    })
    const model = vertexAI.getGenerativeModel({ model: GEMINI_UTILITY_MODEL, systemInstruction: systemPrompt, generationConfig: utilConfig })
    const result = await model.generateContent(userPrompt)
    return (result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: GEMINI_UTILITY_MODEL, systemInstruction: systemPrompt, generationConfig: utilConfig, tools: [] })
  const result = await model.generateContent(userPrompt)
  return result.response.text().trim()
}
