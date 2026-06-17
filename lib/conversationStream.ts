export interface ConvStreamState {
  text: string
  phase: string // 'generating' | 'revising'
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
  const s: ConvStreamState = { text: '', phase: 'generating', done: false, msgId: null, error: '', retryable: false, abort, pollId: null, listeners: new Set() }
  _store.set(convId, s)
  return s
}

function _notify(convId: string) {
  _store.get(convId)?.listeners.forEach(fn => fn())
}

export function clearConvStream(convId: string) {
  const s = _store.get(convId)
  if (s?.pollId != null) clearInterval(s.pollId)
  try { s?.abort.abort() } catch {}
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

function startStream(convId: string, msgId: string) {
  startSse(convId, msgId).then(handled => {
    if (!handled) startPoll(convId, msgId)
  })
}

// SSE로 토큰 즉시 수신. 서버에 활성 스트림이 없거나(404) 도중에 끊기면 false를 반환해 폴링으로 폴백.
async function startSse(convId: string, msgId: string): Promise<boolean> {
  const s = _store.get(convId)
  if (!s) return true

  try {
    const res = await fetch(`/api/conversations/${convId}/messages/${msgId}/stream`, {
      credentials: 'include',
      signal: s.abort.signal,
    })
    if (!res.ok || !res.body) return false

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let sawDone = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const events = buf.split('\n\n')
      buf = events.pop() ?? ''
      for (const ev of events) {
        const line = ev.split('\n').find(l => l.startsWith('data: '))
        if (!line) continue
        let payload: any
        try { payload = JSON.parse(line.slice(6)) } catch { continue }
        const cur = _store.get(convId)
        if (!cur) return true
        if (typeof payload.snapshot === 'string') cur.text = payload.snapshot
        if (typeof payload.chunk === 'string') cur.text += payload.chunk
        if (typeof payload.phase === 'string') cur.phase = payload.phase
        if (payload.done) {
          sawDone = true
          if (payload.error) {
            cur.error = 'AI가 응답을 생성하지 않았습니다. 다시 시도해주세요.'
            cur.retryable = true
          }
          cur.done = true
        }
        _notify(convId)
      }
      if (sawDone) break
    }

    if (!sawDone) {
      const cur = _store.get(convId)
      if (cur && !cur.done) return false
    }
    return true
  } catch (e: any) {
    if (e?.name === 'AbortError') return true
    return false
  }
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

export async function runConvStream(convId: string, content: string, dice?: { stat?: string }) {
  const abort = new AbortController()
  const state = _create(convId, abort)

  try {
    const res = await doFetch(`/api/conversations/${convId}/chat`, dice ? { content, dice } : { content }, abort.signal)

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
    startStream(convId, messageId)
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      const s = getConvStream(convId)
      if (s) { s.error = '연결이 끊어졌습니다. 다시 시도해주세요.'; s.retryable = true; s.done = true; _notify(convId) }
    }
  }
}

export async function runConvContinue(convId: string, comeback?: { elapsed: string }) {
  const abort = new AbortController()
  const state = _create(convId, abort)

  try {
    const res = await doFetch(`/api/conversations/${convId}/continue`, comeback ? { comeback } : {}, abort.signal)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      state.error = data.error || '자동 진행에 실패했습니다.'
      state.retryable = res.status >= 500 || res.status === 429
      state.done = true
      _notify(convId)
      return
    }

    const { messageId } = await res.json()
    state.msgId = messageId
    _notify(convId)
    startStream(convId, messageId)
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
    startStream(convId, messageId)
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      const s = getConvStream(convId)
      if (s) { s.error = '재생성 중 연결이 끊어졌습니다. 다시 시도해주세요.'; s.retryable = true; s.done = true; _notify(convId) }
    }
  }
}
