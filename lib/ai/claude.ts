// Claude adapter — disabled in v1, enabled in v2
// Note: Claude does not support frequencyPenalty/presencePenalty.
// When enabled, replace with repetition-prevention instructions in the base rules block.
export async function streamClaudeChat(): Promise<never> {
  throw new Error('Claude adapter is not available in v1')
}
