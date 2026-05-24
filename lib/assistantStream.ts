export interface StreamEntry {
  text: string
  done: boolean
  msgId: string | null
  error: string
  abort: AbortController
  userMsgId: string
  listeners: Set<() => void>
}

const _store = new Map<string, StreamEntry>()

export function getStream(convId: string): StreamEntry | null {
  return _store.get(convId) ?? null
}

export function createStream(convId: string, userMsgId: string, abort: AbortController): StreamEntry {
  const entry: StreamEntry = {
    text: '',
    done: false,
    msgId: null,
    error: '',
    abort,
    userMsgId,
    listeners: new Set(),
  }
  _store.set(convId, entry)
  return entry
}

export function updateStream(convId: string, patch: Partial<Omit<StreamEntry, 'listeners' | 'abort'>>) {
  const entry = _store.get(convId)
  if (!entry) return
  Object.assign(entry, patch)
  entry.listeners.forEach(fn => fn())
}

export function clearStream(convId: string) {
  _store.delete(convId)
}

export function subscribe(convId: string, fn: () => void): () => void {
  const entry = _store.get(convId)
  if (!entry) return () => {}
  entry.listeners.add(fn)
  return () => entry.listeners.delete(fn)
}
