'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppProvider } from '@/providers/AppProvider'
import Dock from '@/components/shell/Dock'
import { getAccessToken } from '@/lib/authClient'

const SCREEN_LABELS: Record<string, string> = {
  '/': '홈',
  '/characters': '캐릭터 선택',
  '/characters/new': '캐릭터 만들기',
  '/personas': '내 페르소나',
  '/conversations/new': '새 대화',
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isChatPage = pathname.startsWith('/conversations/') && pathname !== '/conversations/new'
  const label = SCREEN_LABELS[pathname] ?? (isChatPage ? '채팅' : '')

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login')
  }, [])

  return (
    <div className="shell-wrap">
      <div className="shell">
        <div className="shell-title">
          <div className="hstack" style={{ gap: 6 }}>
            <svg viewBox="0 0 16 16" width="14" height="14" shapeRendering="crispEdges">
              <rect x="2" y="2" width="12" height="12" fill="#ff8fcf"/>
              <rect x="3" y="3" width="10" height="10" fill="#ffe07a"/>
              <rect x="6" y="5" width="1" height="1" fill="#1a1438"/>
              <rect x="9" y="5" width="1" height="1" fill="#1a1438"/>
              <rect x="6" y="8" width="4" height="1" fill="#1a1438"/>
            </svg>
            <span>StoryFit{label ? ` — ${label}` : ''}</span>
          </div>
          <div className="win-controls">
            <button>_</button><button>▢</button><button>×</button>
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
