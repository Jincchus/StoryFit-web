const TOKEN_KEY = 'sf_access_token'

export const setAccessToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const getAccessToken = () => typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
export const clearAccessToken = () => localStorage.removeItem(TOKEN_KEY)

export async function apiLogin(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '로그인 실패')
  setAccessToken(data.accessToken)
  return data
}

export async function apiRegister(email: string, password: string) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '회원가입 실패')
  setAccessToken(data.accessToken)
  return data
}
