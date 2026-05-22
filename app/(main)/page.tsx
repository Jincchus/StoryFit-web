'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIsAdmin } from '@/lib/authClient'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'

const BASE_ICONS = [
  { label: '채팅 목록', icon: PixelIcons.chat, href: '/chatlist' },
  { label: '새 대화', icon: <PixelAvatar kind="ai" size={38} />, href: '/conversations/new' },
  { label: '캐릭터', icon: <PixelAvatar kind="custom" size={38} />, href: '/characters' },
  { label: '페르소나', icon: PixelIcons.user, href: '/personas' },
]

const ADMIN_ICON = { label: '관리자 패널', icon: PixelIcons.settings, href: '/admin' }

const STEPS = [
  { num: 1, label: '페르소나 설정', desc: 'AI가 나를 어떻게 부를지', href: '/personas', icon: PixelIcons.user },
  { num: 2, label: '캐릭터 선택', desc: '대화 상대를 고르세요', href: '/characters', icon: <PixelAvatar kind="custom" size={20} /> },
  { num: 3, label: '대화 시작', desc: '모드를 정하고 시작!', href: '/conversations/new', icon: PixelIcons.chat },
]

export default function HomePage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    setIsAdmin(getIsAdmin())
    if (!localStorage.getItem('sf_onboarded')) setShowGuide(true)
  }, [])

  const dismissGuide = () => {
    localStorage.setItem('sf_onboarded', '1')
    setShowGuide(false)
  }

  const icons = isAdmin ? [...BASE_ICONS, ADMIN_ICON] : BASE_ICONS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0 10px 4px', alignItems: 'flex-start' }}>
      {showGuide && (
        <div className="win" style={{ width: '100%', marginBottom: 4 }}>
          <div className="win-title">
            <div className="win-title-l"><span>StoryFit 시작하기</span></div>
            <div className="win-controls"><button onClick={dismissGuide}>×</button></div>
          </div>
          <div className="win-body vstack" style={{ gap: 10 }}>
            <div className="tiny muted">처음이신가요? 아래 순서대로 진행하면 바로 시작할 수 있어요.</div>
            <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
              {STEPS.map((step, i) => (
                <div
                  key={step.num}
                  onClick={() => { dismissGuide(); router.push(step.href) }}
                  style={{
                    flex: '1 1 120px', minWidth: 100,
                    border: '1.5px solid var(--chrome-border)',
                    borderRadius: 'var(--radius)',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    background: 'var(--chrome-face)',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div className="hstack" style={{ gap: 5 }}>
                    <span style={{ fontWeight: 700, color: 'var(--hot-pink)', fontSize: 11 }}>0{step.num}</span>
                    {i < STEPS.length - 1 && <span className="tiny muted" style={{ marginLeft: 'auto', fontSize: 9 }}>→ 다음</span>}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{step.label}</div>
                  <div className="tiny muted">{step.desc}</div>
                </div>
              ))}
            </div>
            <button className="btn ghost" style={{ fontSize: 10, alignSelf: 'flex-end' }} onClick={dismissGuide}>
              이미 알고 있어요 ×
            </button>
          </div>
        </div>
      )}

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

      {!showGuide && (
        <button
          className="btn ghost"
          style={{ fontSize: 10, marginTop: 4, alignSelf: 'flex-start' }}
          onClick={() => setShowGuide(true)}
        >
          ? 시작 가이드 보기
        </button>
      )}
    </div>
  )
}
