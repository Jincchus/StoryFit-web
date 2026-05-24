const WINDOW_MS = 60_000
const MAX_REQUESTS = 20
const CLEANUP_AFTER_MS = 3_600_000

const userTimestamps = new Map<string, number[]>()
let lastCleanup = Date.now()

export function checkRateLimit(userId: string): boolean {
  const now = Date.now()

  if (now - lastCleanup > CLEANUP_AFTER_MS) {
    userTimestamps.forEach((ts, uid) => {
      if (ts.length === 0 || now - ts[ts.length - 1] > CLEANUP_AFTER_MS) {
        userTimestamps.delete(uid)
      }
    })
    lastCleanup = now
  }

  const timestamps = (userTimestamps.get(userId) ?? []).filter(t => now - t < WINDOW_MS)
  if (timestamps.length >= MAX_REQUESTS) return false
  timestamps.push(now)
  userTimestamps.set(userId, timestamps)
  return true
}
