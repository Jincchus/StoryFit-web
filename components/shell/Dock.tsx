'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Dock() {
  const pathname = usePathname()
  const router = useRouter()
  const [clock, setClock] = useState('')

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }))
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [])

  const isHome = pathname === '/'
  const isPersonas = pathname === '/personas'
  const isChat = pathname.startsWith('/conversations/') && pathname !== '/conversations/new'
  const isNewConv = pathname === '/characters' || pathname === '/conversations/new'
  const isCharCreate = pathname === '/characters/new'

  return (
    <div className="dock">
      <button className="start">
        <svg viewBox="0 0 16 16" width="12" height="12" shapeRendering="crispEdges">
          <rect x="2" y="2" width="5" height="5" fill="#ffe07a"/>
          <rect x="9" y="2" width="5" height="5" fill="#fff"/>
          <rect x="2" y="9" width="5" height="5" fill="#a3e0ff"/>
          <rect x="9" y="9" width="5" height="5" fill="#b8f5d2"/>
        </svg>
        시작
      </button>
      <div style={{ display: 'flex', gap: 4, overflow: 'hidden', flex: 1 }}>
        <button className={`dock-tab ${isHome ? 'active' : ''}`} onClick={() => router.push('/')}>홈</button>
        <button className={`dock-tab ${isPersonas ? 'active' : ''}`} onClick={() => router.push('/personas')}>페르소나</button>
        {isChat && <button className="dock-tab active">▸ 채팅</button>}
        {isNewConv && <button className="dock-tab active">▸ 새 대화</button>}
        {isCharCreate && <button className="dock-tab active">▸ 캐릭터 만들기</button>}
      </div>
      <div className="tray">
        <span title="네트워크" style={{ color: '#22a06b' }}>●</span>
      </div>
      <div className="clock">{clock}</div>
    </div>
  )
}
