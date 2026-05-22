'use client'
import { useRouter } from 'next/navigation'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'

const ICONS = [
  { label: '채팅 목록', icon: PixelIcons.chat, href: '/chatlist' },
  { label: '캐릭터', icon: <PixelAvatar kind="ai" size={38} />, href: '/characters' },
  { label: '페르소나', icon: PixelIcons.user, href: '/personas' },
]

export default function HomePage() {
  const router = useRouter()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0 10px 4px', alignItems: 'flex-start' }}>
      {ICONS.map(({ label, icon, href }) => (
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
