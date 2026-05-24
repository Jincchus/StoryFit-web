'use client'
import { useEffect } from 'react'
import { applyTheme, getSavedTheme } from '@/lib/theme'
import { api } from '@/lib/api'

export default function ThemeProvider() {
  useEffect(() => {
    applyTheme(getSavedTheme())
    api.get('/api/user/settings')
      .then((data: any) => { if (data?.theme) applyTheme(data.theme) })
      .catch(() => {})
  }, [])
  return null
}
