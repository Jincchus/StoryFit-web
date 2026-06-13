import { api } from '@/lib/api'

// Expo 앱이 WebView에 주입한 푸시 토큰(window.__EXPO_PUSH_TOKEN__)을 서버에 등록한다.
// 토큰 주입 타이밍이 페이지 로드보다 늦을 수 있어 최대 20초 재시도.
export function registerPushTokenIfAvailable() {
  if (typeof window === 'undefined') return
  let tries = 0
  const attempt = () => {
    const token = (window as any).__EXPO_PUSH_TOKEN__
    if (typeof token === 'string' && token) {
      if (localStorage.getItem('sf_push_token') === token) return
      api.post('/api/user/push-token', { token })
        .then(() => localStorage.setItem('sf_push_token', token))
        .catch(() => {})
      return
    }
    if (++tries < 20) setTimeout(attempt, 1000)
  }
  attempt()
}
