type BrokerEntry = {
  text: string
  done: boolean
  errored: boolean
  listeners: Set<() => void>
  expiresAt: number
}

// dev 핫리로드·라우트 번들 분리 시에도 단일 인스턴스를 보장
const g = globalThis as { __sfStreamBroker?: Map<string, BrokerEntry> }
const _streams: Map<string, BrokerEntry> = g.__sfStreamBroker ?? (g.__sfStreamBroker = new Map())

function sweep() {
  const now = Date.now()
  _streams.forEach((e, id) => {
    if (now > e.expiresAt) _streams.delete(id)
  })
}

export function brokerStart(msgId: string): void {
  sweep()
  _streams.set(msgId, { text: '', done: false, errored: false, listeners: new Set(), expiresAt: Date.now() + 10 * 60 * 1000 })
}

export function brokerPublish(msgId: string, chunk: string): void {
  const e = _streams.get(msgId)
  if (!e) return
  e.text += chunk
  e.listeners.forEach(fn => fn())
}

export function brokerFinish(msgId: string, errored = false): void {
  const e = _streams.get(msgId)
  if (!e) return
  e.done = true
  e.errored = errored
  e.expiresAt = Date.now() + 60 * 1000
  e.listeners.forEach(fn => fn())
}

export function brokerGet(msgId: string): { text: string; done: boolean; errored: boolean } | null {
  const e = _streams.get(msgId)
  return e ? { text: e.text, done: e.done, errored: e.errored } : null
}

export function brokerSubscribe(msgId: string, fn: () => void): () => void {
  const e = _streams.get(msgId)
  if (!e) return () => {}
  e.listeners.add(fn)
  return () => e.listeners.delete(fn)
}
