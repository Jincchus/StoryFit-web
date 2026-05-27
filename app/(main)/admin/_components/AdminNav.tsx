'use client'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/names', label: '랜덤 이름' },
  { href: '/admin/tags', label: '태그 관리' },
  { href: '/admin/config', label: '전역 설정' },
  { href: '/admin/users', label: '유저 관리' },
  { href: '/admin/images', label: '이미지 관리' },
  { href: '/admin/costs', label: 'AI 비용' },
  { href: '/admin/logs', label: '활동 로그' },
  { href: '/admin/error-logs', label: '오류 로그' },
]

export default function AdminNav({ current }: { current: string }) {
  const router = useRouter()
  return (
    <div className="hstack" style={{ gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
      {NAV.map(n => (
        <button
          key={n.href}
          className={`btn ${current === n.href ? 'primary' : 'ghost'}`}
          style={{ fontSize: 10, padding: '3px 8px' }}
          onClick={() => router.push(n.href)}
        >{n.label}</button>
      ))}
    </div>
  )
}
