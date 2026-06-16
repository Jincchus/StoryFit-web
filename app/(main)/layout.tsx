'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppProvider } from '@/providers/AppProvider'
import Dock from '@/components/shell/Dock'
import { getAccessToken } from '@/lib/authClient'
import { registerPushTokenIfAvailable } from '@/lib/pushClient'

const SCREEN_LABELS: Record<string, string> = {
  '/': '홈',
  '/chatlist': '채팅 목록',
  '/characters': '캐릭터 선택',
  '/characters/new': '캐릭터 만들기',
  '/conversations/new': '새 대화',
  '/explore': '탐색',
  '/settings': '설정',
  '/library': '서재',
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isChatPage = pathname.startsWith('/conversations/') && pathname !== '/conversations/new'
  const label = SCREEN_LABELS[pathname] ?? (isChatPage ? '채팅' : '')
  const [wideMode, setWideMode] = useState(false)

  useEffect(() => {
    if (!getAccessToken()) { router.replace('/login'); return }
    setWideMode(localStorage.getItem('sf_wide') === '1')
    registerPushTokenIfAvailable()
  }, [])

  return (
    <div className={`shell-wrap${wideMode ? ' wide' : ''}`}>
      <div className="shell">
        <div className="shell-title">
          <div className="hstack" style={{ gridColumn: 1, justifyContent: 'flex-start' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>📖</span>
          </div>
        </div>

        <div className="shell-body">
          <div className="workwin">{children}</div>
        </div>

        <Dock />
      </div>
    </div>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  )
}
