'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { apiLogout, getIsAdmin } from '@/lib/authClient'

export default function Dock() {
  const pathname = usePathname()
  const router = useRouter()
  const [clock, setClock] = useState('')
  const [showStart, setShowStart] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const startRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsAdmin(getIsAdmin())
    const update = () => setClock(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }))
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!showStart) return
    const handleClick = (e: MouseEvent) => {
      if (!startRef.current?.contains(e.target as Node)) setShowStart(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showStart])

  const handleLogout = async () => {
    setShowStart(false)
    await apiLogout()
    router.replace('/login')
  }

  const isHome = pathname === '/'
  const isChatList = pathname === '/chatlist'
  const isChat = pathname.startsWith('/conversations/') && pathname !== '/conversations/new'
  const isCharSelect = pathname === '/characters'
  const isNewConv = pathname === '/conversations/new'
  const isCharCreate = pathname === '/characters/new'
  const isSettings = pathname === '/settings'
  const isAssistant = pathname.startsWith('/assistant')
  const isLibrary = pathname.startsWith('/library')
  const isWhif = pathname.startsWith('/whif')

  return (
    <div className="dock">
      <div ref={startRef} style={{ position: 'relative' }}>
        {showStart && (
          <div className="start-menu">
            <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/chatlist') }}>
              💬 채팅 목록
            </button>
            <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/conversations/new') }}>
              ✦ 새 대화
            </button>
            <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/assistant') }}>
              🤖 AI 채팅
            </button>
            <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/characters') }}>
              🎭 캐릭터
            </button>
            <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/whif') }}>
              🪐 WHIF 센터
            </button>
            <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/library') }}>
              📚 서재
            </button>
            <div className="start-menu-divider" />
            <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/settings') }}>
              ◈ 설정
            </button>
            {isAdmin && (
              <button className="start-menu-item" onClick={() => { setShowStart(false); router.push('/admin') }}>
                ⚙ 관리자 패널
              </button>
            )}
            <div className="start-menu-divider" />
            <button className="start-menu-item danger" onClick={handleLogout}>
              ⏻ 로그아웃
            </button>
          </div>
        )}
        <button className={`start ${showStart ? 'active' : ''}`} onClick={() => setShowStart(s => !s)}>
          <svg viewBox="0 0 16 16" width="12" height="12" shapeRendering="crispEdges">
            <rect x="2" y="2" width="5" height="5" fill="#ffe07a"/>
            <rect x="9" y="2" width="5" height="5" fill="#fff"/>
            <rect x="2" y="9" width="5" height="5" fill="#a3e0ff"/>
            <rect x="9" y="9" width="5" height="5" fill="#b8f5d2"/>
          </svg>
          시작
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, overflow: 'hidden', flex: 1 }}>
        <button className={`dock-tab ${isHome ? 'active' : ''}`} onClick={() => router.push('/')}>홈</button>
      </div>
      <div className="tray">
        <span title="네트워크" style={{ color: '#22a06b' }}>●</span>
      </div>
      <div className="clock">{clock}</div>
    </div>
  )
}
