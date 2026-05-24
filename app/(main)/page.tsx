'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getIsAdmin } from '@/lib/authClient'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'

const BASE_ICONS = [
  { label: '채팅 목록', icon: PixelIcons.chat, href: '/chatlist' },
  { label: '새 대화', icon: <PixelAvatar kind="ai" size={38} />, href: '/conversations/new' },
  { label: 'AI 채팅', icon: PixelIcons.bot, href: '/assistant' },
  { label: '캐릭터', icon: <PixelAvatar kind="custom" size={38} />, href: '/characters' },
  { label: '설정', icon: PixelIcons.sliders, href: '/settings' },
]

const ADMIN_ICON = { label: '관리자\n패널', icon: PixelIcons.settings, href: '/admin' }

const STEPS = [
  { num: 1, label: '캐릭터 만들기', desc: '대화 상대 & 내 역할 설정', href: '/characters', icon: <PixelAvatar kind="custom" size={20} /> },
  { num: 2, label: '대화 시작', desc: '캐릭터를 골라 시작!', href: '/conversations/new', icon: PixelIcons.chat },
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
    <>
      {showGuide && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100 }}
            onClick={dismissGuide}
          />
          <div
            className="win"
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 101,
              width: 'min(380px, 90vw)',
            }}
          >
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
                      flex: '1 1 100px', minWidth: 90,
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
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0 10px 4px', alignItems: 'flex-start' }}>
        {icons.map(({ label, icon, href }) => (
          <div key={label} className="di" onClick={() => router.push(href)} style={{ cursor: 'pointer' }}>
            <div className="di-pic">
              {typeof icon === 'string'
                ? <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center' }}>{icon}</div>
                : icon
              }
            </div>
            <span style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>{label}</span>
          </div>
        ))}
      </div>

      {!showGuide && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            cursor: 'pointer',
          }}
          onClick={() => setShowGuide(true)}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--hot-pink)', color: '#fff',
            display: 'grid', placeItems: 'center',
            fontSize: 20, fontWeight: 700,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            border: '2px solid rgba(255,255,255,0.2)',
          }}>?</div>
          <div style={{ fontSize: 9, color: 'var(--ink-soft)', fontWeight: 600 }}>가이드</div>
        </div>
      )}
    </>
  )
}
