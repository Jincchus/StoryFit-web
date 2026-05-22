const AUTHED_KEY = 'sf_authed'
const ADMIN_KEY = 'sf_is_admin'

export const setAccessToken = (_token: string) => localStorage.setItem(AUTHED_KEY, '1')
export const getAccessToken = () => typeof window !== 'undefined' ? localStorage.getItem(AUTHED_KEY) : null
export const clearAccessToken = () => localStorage.removeItem(AUTHED_KEY)
export const setIsAdmin = (v: boolean) => localStorage.setItem(ADMIN_KEY, v ? '1' : '0')
export const getIsAdmin = () => typeof window !== 'undefined' ? localStorage.getItem(ADMIN_KEY) === '1' : false
export const clearIsAdmin = () => localStorage.removeItem(ADMIN_KEY)

export async function apiLogin(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  setAccessToken('')
  setIsAdmin(!!data.isAdmin)
  return data
}

export async function apiLogout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
  clearAccessToken()
  clearIsAdmin()
}

export async function apiRegister(email: string, password: string) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  setAccessToken('')
  return data
}
