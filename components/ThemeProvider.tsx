'use client'
import { useEffect } from 'react'
import { applyTheme, getSavedTheme } from '@/lib/theme'
import { api } from '@/lib/api'
import { getAccessToken } from '@/lib/authClient'

export default function ThemeProvider() {
  useEffect(() => {
    applyTheme(getSavedTheme())
    // 비로그인(로그인/회원가입 페이지 등)에선 authed 호출을 하지 않는다 — 401 → 리다이렉트 방지.
    if (!getAccessToken()) return
    api.get('/api/user/settings')
      .then((data: any) => { if (data?.theme) applyTheme(data.theme) })
      .catch(() => {})
  }, [])
  return null
}
