import { clearAccessToken } from './authClient'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    return res.ok
  } catch {
    return false
  }
}

async function apiFetch(path: string, options?: RequestInit, isRetry = false): Promise<Response> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { ...JSON_HEADERS, ...(options?.headers as Record<string, string> ?? {}) },
  })
  if (res.status === 401 && !isRetry) {
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetch(path, options, true)
    clearAccessToken()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('로그인이 필요합니다.')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data.error || (res.status === 403 ? '권한이 없습니다.' : res.status === 404 ? '데이터를 찾을 수 없습니다.' : '서버 오류가 발생했습니다.')
    throw new Error(msg)
  }
  return res
}

export const api = {
  get: (path: string) => apiFetch(path).then(r => r.json()),
  post: (path: string, body: unknown) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
  patch: (path: string, body: unknown) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.json()),
  delete: (path: string, body?: unknown) => apiFetch(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) }),

  async streamChat(convId: string, content: string, signal: AbortSignal) {
    const res = await fetch(`/api/conversations/${convId}/chat`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'include',
      body: JSON.stringify({ content }),
      signal,
    })
    if (res.status === 401) {
      const refreshed = await tryRefresh()
      if (refreshed) {
        return fetch(`/api/conversations/${convId}/chat`, {
          method: 'POST',
          headers: JSON_HEADERS,
          credentials: 'include',
          body: JSON.stringify({ content }),
          signal,
        })
      }
      clearAccessToken()
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
    return res
  },

  async streamRegenerate(convId: string, signal: AbortSignal) {
    const res = await fetch(`/api/conversations/${convId}/regenerate`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'include',
      signal,
    })
    if (res.status === 401) {
      const refreshed = await tryRefresh()
      if (refreshed) {
        return fetch(`/api/conversations/${convId}/regenerate`, {
          method: 'POST',
          headers: JSON_HEADERS,
          credentials: 'include',
          signal,
        })
      }
      clearAccessToken()
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
    return res
  },
}
