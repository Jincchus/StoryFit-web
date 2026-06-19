'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppProvider } from '@/providers/AppProvider'
import { getAccessToken } from '@/lib/authClient'

export default function RofanLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => { if (!getAccessToken()) router.replace('/login') }, [])
  return (
    <AppProvider>
      <div className="rofan-root">{children}</div>
    </AppProvider>
  )
}
