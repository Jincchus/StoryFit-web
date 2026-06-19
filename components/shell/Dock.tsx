'use client'
import { usePathname, useRouter } from 'next/navigation'

const TABS = [
  {
    href: '/', icon: '🏠', label: '홈',
    isActive: (p: string) => p === '/',
  },
  {
    href: '/chatlist', icon: '💬', label: '채팅',
    isActive: (p: string) => p === '/chatlist' || p.startsWith('/conversations') || p.startsWith('/assistant'),
  },
  {
    href: '/explore', icon: '🧭', label: '탐색',
    isActive: (p: string) => p === '/explore' || p.startsWith('/whif') || p.startsWith('/zeta') || p.startsWith('/melting') || p.startsWith('/tikita') || p.startsWith('/chub') || p.startsWith('/rofan') || p.startsWith('/characters'),
  },
  {
    href: '/library', icon: '📚', label: '서재',
    isActive: (p: string) => p.startsWith('/library'),
  },
  {
    href: '/settings', icon: '⚙️', label: '설정',
    isActive: (p: string) => p.startsWith('/settings') || p.startsWith('/admin'),
  },
]

export default function Dock() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="dock">
      {TABS.map(tab => (
        <button
          key={tab.href}
          className={`dock-item ${tab.isActive(pathname) ? 'active' : ''}`}
          aria-label={tab.label}
          onClick={() => router.push(tab.href)}
        >
          <span className="ic">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
