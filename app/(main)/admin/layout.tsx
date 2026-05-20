'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken, getIsAdmin } from '@/lib/authClient'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    if (!getAccessToken() || !getIsAdmin()) router.replace('/')
  }, [router])
  return <>{children}</>
}
