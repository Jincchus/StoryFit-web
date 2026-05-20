// OpenAI adapter — disabled in v1, enabled in v2
export async function streamOpenAIChat(): Promise<never> {
  throw new Error('OpenAI adapter is not available in v1')
}
