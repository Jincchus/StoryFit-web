export interface ConvStreamState {
  text: string
  done: boolean
  msgId: string | null
  error: string
  retryable: boolean
  abort: AbortController
  pollId: ReturnType<typeof setInterval> | null
  listeners: Set<() => void>
}

const _store = new Map<string, ConvStreamState>()

export function getConvStream(convId: string): ConvStreamState | null {
  return _store.get(convId) ?? null
}

function _create(convId: string, abort: AbortController): ConvStreamState {
  const s: ConvStreamState = { text: '', done: false, msgId: null, error: '', retryable: false, abort, pollId: null, listeners: new Set() }
  _store.set(convId, s)
  return s
}

function _notify(convId: string) {
  _store.get(convId)?.listeners.forEach(fn => fn())
}

export function clearConvStream(convId: string) {
  const s = _store.get(convId)
  if (s?.pollId != null) clearInterval(s.pollId)
  _store.delete(convId)
}

export function subscribeConvStream(convId: string, fn: () => void): () => void {
  const s = _store.get(convId)
  if (!s) return () => {}
  s.listeners.add(fn)
  return () => s.listeners.delete(fn)
}

async function doFetch(url: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const opts: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal }
  if (body !== undefined) opts.body = JSON.stringify(body)
  let res = await fetch(url, opts)
  if (res.status === 401) {
    const ok = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).then(r => r.ok).catch(() => false)
    if (ok) {
      res = await fetch(url, opts)
    } else {
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
  }
  return res
}

function startPoll(convId: string, msgId: string) {
  let pollId: ReturnType<typeof setInterval>

  const tick = async () => {
    const s = _store.get(convId)
    if (!s) { clearInterval(pollId); return }

    try {
      const res = await fetch(`/api/conversations/${convId}/messages/${msgId}`, { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 404) {
          s.error = 'AI가 응답을 생성하지 않았습니다. 다시 시도해주세요.'
          s.retryable = true
          s.done = true
          clearInterval(pollId)
          _notify(convId)
        }
        return
      }
      const msg = await res.json()
      s.text = msg.content ?? ''
      if (!msg.isStreaming) {
        s.done = true
        clearInterval(pollId)
      }
    } catch {
      // 네트워크 오류는 무시하고 다음 틱에 재시도
    }

    _notify(convId)
  }

  pollId = setInterval(tick, 600)
  const s = _store.get(convId)
  if (s) s.pollId = pollId
  tick()
}

export async function runConvStream(convId: string, content: string) {
  const abort = new AbortController()
  const state = _create(convId, abort)

  try {
    const res = await doFetch(`/api/conversations/${convId}/chat`, { content }, abort.signal)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      state.error = data.error || 'AI 응답 생성에 실패했습니다.'
      state.retryable = res.status >= 500 || res.status === 429
      state.done = true
      _notify(convId)
      return
    }

    const { messageId } = await res.json()
    state.msgId = messageId
    _notify(convId)
    startPoll(convId, messageId)
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      const s = getConvStream(convId)
      if (s) { s.error = '연결이 끊어졌습니다. 다시 시도해주세요.'; s.retryable = true; s.done = true; _notify(convId) }
    }
  }
}

export async function runConvRegenerate(convId: string) {
  const abort = new AbortController()
  const state = _create(convId, abort)

  try {
    const res = await doFetch(`/api/conversations/${convId}/regenerate`, undefined, abort.signal)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      state.error = data.error || '재생성에 실패했습니다.'
      state.retryable = res.status >= 500 || res.status === 429
      state.done = true
      _notify(convId)
      return
    }

    const { messageId } = await res.json()
    state.msgId = messageId
    _notify(convId)
    startPoll(convId, messageId)
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      const s = getConvStream(convId)
      if (s) { s.error = '재생성 중 연결이 끊어졌습니다. 다시 시도해주세요.'; s.retryable = true; s.done = true; _notify(convId) }
    }
  }
}
