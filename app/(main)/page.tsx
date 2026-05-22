'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIsAdmin } from '@/lib/authClient'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'

const BASE_ICONS = [
  { label: '채팅 목록', icon: PixelIcons.chat, href: '/chatlist' },
  { label: '새 대화', icon: <PixelAvatar kind="ai" size={38} />, href: '/conversations/new' },
  { label: '페르소나', icon: PixelIcons.user, href: '/personas' },
]

const ADMIN_ICON = { label: '관리자 패널', icon: PixelIcons.settings, href: '/admin' }

export default function HomePage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    setIsAdmin(getIsAdmin())
  }, [])

  const icons = isAdmin ? [...BASE_ICONS, ADMIN_ICON] : BASE_ICONS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0 10px 4px', alignItems: 'flex-start' }}>
      {icons.map(({ label, icon, href }) => (
        <div key={label} className="di" onClick={() => router.push(href)} style={{ cursor: 'pointer' }}>
          <div className="di-pic">
            {typeof icon === 'string'
              ? <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center' }}>{icon}</div>
              : icon
            }
          </div>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
