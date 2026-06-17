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

// Gemini 2.5 Pro는 thinking을 끌 수 없다(0 설정 시 API 400, 유효 범위 128~32768).
// 속도-품질 절충: 0/미설정이면 동적(-1) 대신 최소값(128)으로 고정해 추론 지연을 최소화한다.
// 명시값이 0보다 크되 128 미만이면 128로 클램프한다. Flash는 0(off)을 그대로 허용한다.
const PRO_MIN_THINKING_BUDGET = 128
function resolveThinkingBudget(model: string, requested?: number): number {
  const b = requested ?? 0
  if (model.includes('pro')) return b > 0 ? Math.max(b, PRO_MIN_THINKING_BUDGET) : PRO_MIN_THINKING_BUDGET
  return b
}

// Gemini는 히스토리가 user 턴으로 시작해야 한다.
// 오프닝 메시지(맨 앞 assistant 턴)를 잘라내면 대화 초반에 인트로가 통째로 사라지므로,
// 자르는 대신 더미 user 턴을 앞에 붙여 보존한다.
function toGeminiHistory(messages: GeminiChatParams['messages']): GeminiChatParams['messages'] {
  const rawHistory = messages.slice(0, -1)
  if (rawHistory.length === 0 || rawHistory[0].role === 'user') return rawHistory
  return [{ role: 'user', parts: [{ text: '(오프닝 장면을 시작해줘)' }] }, ...rawHistory]
}

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
    thinkingConfig: { thinkingBudget: resolveThinkingBudget(GEMINI_CHAT_MODEL, params.thinkingBudget) },
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

  const history = toGeminiHistory(params.messages)

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

  const history = toGeminiHistory(params.messages)

  const chat = ai.chats.create({
    model: GEMINI_CHAT_MODEL,
    history: history.map(m => ({ role: m.role, parts: m.parts })),
    config: {
      systemInstruction: params.systemPrompt,
      temperature: params.temperature ?? 0.9,
      frequencyPenalty: params.frequencyPenalty ?? 0.3,
      maxOutputTokens: params.maxOutputTokens ?? 8192,
      thinkingConfig: { thinkingBudget: resolveThinkingBudget(GEMINI_CHAT_MODEL, params.thinkingBudget) },
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

export async function generateText(systemPrompt: string, userPrompt: string, maxOutputTokens = 1024, safetyLevel?: SafetyLevel, thinkingBudget = 0): Promise<string> {
  // thinkingBudget: 0=비활성(기본, 빠름) / -1=동적 추론(품질↑, 과삭제 방지용)
  const utilConfig = { maxOutputTokens, thinkingConfig: { thinkingBudget } }
  const safetySettings = HARM_CATEGORIES.map(category => ({
    category,
    threshold: SAFETY_MAP[safetyLevel ?? 'standard'],
  }))
  if (process.env.GEMINI_PROVIDER === 'vertex') {
    const { VertexAI } = await import('@google-cloud/vertexai')
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT!,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    })
    const model = vertexAI.getGenerativeModel({ model: GEMINI_UTILITY_MODEL, systemInstruction: systemPrompt, generationConfig: utilConfig, safetySettings: safetySettings as any })
    const result = await model.generateContent(userPrompt)
    return (result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: GEMINI_UTILITY_MODEL, systemInstruction: systemPrompt, generationConfig: utilConfig, safetySettings, tools: [] })
  const result = await model.generateContent(userPrompt)
  return result.response.text().trim()
}
