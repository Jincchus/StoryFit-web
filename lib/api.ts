import { getAccessToken } from './authClient'

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options?.headers as Record<string, string> ?? {}) },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res
}

export const api = {
  get: (path: string) => apiFetch(path).then(r => r.json()),
  post: (path: string, body: unknown) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
  patch: (path: string, body: unknown) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.json()),
  delete: (path: string, body?: unknown) => apiFetch(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) }),

  streamChat(convId: string, content: string, signal: AbortSignal) {
    return fetch(`/api/conversations/${convId}/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content }),
      signal,
    })
  },
}
