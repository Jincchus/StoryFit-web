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
}

export async function streamGeminiChat(
  params: GeminiChatParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: params.systemPrompt,
    generationConfig: {
      temperature: params.temperature ?? 0.9,
      frequencyPenalty: params.frequencyPenalty ?? 0.3,
      maxOutputTokens: 2048,
    },
    safetySettings: HARM_CATEGORIES.map(category => ({
      category,
      threshold: SAFETY_MAP[params.safetyLevel ?? 'standard'],
    })),
  })

  const rawHistory = params.messages.slice(0, -1)
  const firstUserIdx = rawHistory.findIndex(m => m.role === 'user')
  const history = firstUserIdx > 0 ? rawHistory.slice(firstUserIdx) : rawHistory

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
  return fullText
}
