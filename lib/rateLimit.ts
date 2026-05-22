const WINDOW_MS = 60_000
const MAX_REQUESTS = 20

const userTimestamps = new Map<string, number[]>()

export function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const timestamps = (userTimestamps.get(userId) ?? []).filter(t => now - t < WINDOW_MS)
  if (timestamps.length >= MAX_REQUESTS) return false
  timestamps.push(now)
  userTimestamps.set(userId, timestamps)
  return true
}
