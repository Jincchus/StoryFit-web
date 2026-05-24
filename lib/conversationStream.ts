export interface ConvStreamState {
  text: string
  done: boolean
  msgId: string | null
  error: string
  retryable: boolean
  abort: AbortController
  listeners: Set<() => void>
}

const _store = new Map<string, ConvStreamState>()

export function getConvStream(convId: string): ConvStreamState | null {
  return _store.get(convId) ?? null
}

function _create(convId: string, abort: AbortController): ConvStreamState {
  const s: ConvStreamState = { text: '', done: false, msgId: null, error: '', retryable: false, abort, listeners: new Set() }
  _store.set(convId, s)
  return s
}

function _notify(convId: string) {
  _store.get(convId)?.listeners.forEach(fn => fn())
}

export function clearConvStream(convId: string) {
  _store.delete(convId)
}

export function subscribeConvStream(convId: string, fn: () => void): () => void {
  const s = _store.get(convId)
  if (!s) return () => {}
  s.listeners.add(fn)
  return () => s.listeners.delete(fn)
}

async function* readSse(res: Response) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try { yield JSON.parse(line.slice(6)) } catch {}
    }
  }
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

function makeTimeout(convId: string, abort: AbortController): { reset: () => void; clear: () => void } {
  let id: ReturnType<typeof setTimeout> | null = null
  const fire = () => {
    abort.abort()
    const s = getConvStream(convId)
    if (s) { s.error = '30초 동안 응답이 없어 연결을 종료했습니다.'; s.retryable = true; s.done = true; _notify(convId) }
  }
  const reset = () => { if (id) clearTimeout(id); id = setTimeout(fire, 30000) }
  const clear = () => { if (id) { clearTimeout(id); id = null } }
  return { reset, clear }
}

export async function runConvStream(convId: string, content: string) {
  const abort = new AbortController()
  const state = _create(convId, abort)
  const timer = makeTimeout(convId, abort)
  timer.reset()

  try {
    const res = await doFetch(`/api/conversations/${convId}/chat`, { content }, abort.signal)
    if (!res.ok) {
      timer.clear()
      const data = await res.json().catch(() => ({}))
      state.error = data.error || 'AI 응답 생성에 실패했습니다.'
      state.done = true
      _notify(convId)
      return
    }

    for await (const json of readSse(res)) {
      const s = getConvStream(convId)
      if (!s) break

      if (json.allDone) {
        timer.clear()
        s.done = true
        _notify(convId)
        break
      } else if (json.text) {
        timer.reset()
        s.text += json.text
        _notify(convId)
      } else if (json.done) {
        timer.clear()
        if (!json.characterId) {
          s.msgId = json.messageId
          s.done = true
          _notify(convId)
          break
        }
        // tikiTaka 개별 캐릭터 done: text 초기화 후 다음 캐릭터 스트림 대기
        s.text = ''
        _notify(convId)
      } else if (json.error) {
        timer.clear()
        s.error = json.error
        s.retryable = json.retryable ?? false
        s.done = true
        _notify(convId)
        break
      }
    }
  } catch (e: any) {
    timer.clear()
    if (e.name !== 'AbortError') {
      const s = getConvStream(convId)
      if (s) { s.error = '연결이 끊어졌습니다. 다시 시도해주세요.'; s.done = true; _notify(convId) }
    }
  }
}

export async function runConvRegenerate(convId: string) {
  const abort = new AbortController()
  const state = _create(convId, abort)
  const timer = makeTimeout(convId, abort)
  timer.reset()

  try {
    const res = await doFetch(`/api/conversations/${convId}/regenerate`, undefined, abort.signal)
    if (!res.ok) {
      timer.clear()
      const data = await res.json().catch(() => ({}))
      state.error = data.error || '재생성에 실패했습니다.'
      state.done = true
      _notify(convId)
      return
    }

    for await (const json of readSse(res)) {
      const s = getConvStream(convId)
      if (!s) break
      if (json.text) { timer.reset(); s.text += json.text; _notify(convId) }
      else if (json.done) { timer.clear(); s.msgId = json.messageId; s.done = true; _notify(convId); break }
      else if (json.error) { timer.clear(); s.error = json.error; s.retryable = json.retryable ?? false; s.done = true; _notify(convId); break }
    }
  } catch (e: any) {
    timer.clear()
    if (e.name !== 'AbortError') {
      const s = getConvStream(convId)
      if (s) { s.error = '연결이 끊어졌습니다. 다시 시도해주세요.'; s.done = true; _notify(convId) }
    }
  }
}
