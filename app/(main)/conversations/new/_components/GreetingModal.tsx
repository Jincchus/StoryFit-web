'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AlternativeGreeting } from '../_lib/greetings'

export default function GreetingModal({ greetings, onPick, onClose }: {
  greetings: AlternativeGreeting[]
  onPick: (text: string) => void
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000 }}
        onClick={onClose}
      />
      <div className="win" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9001, width: 'min(500px, 95vw)', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="win-title">
          <div className="win-title-l"><span>📖 시작 상황(도입부) 선택</span></div>
          <div className="win-controls">
            <button onClick={onClose}>×</button>
          </div>
        </div>
        <div className="win-body vstack" style={{ gap: 12, flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          <div className="tiny muted" style={{ marginBottom: 4, lineHeight: 1.5 }}>
            스토리의 시작점이 될 장면이나 챕터를 골라주세요.
          </div>
          <div className="vstack" style={{ gap: 8 }}>
            {greetings.map((g, idx) => (
              <div
                key={idx}
                onClick={() => onPick(g.text)}
                style={{
                  border: '1.5px solid var(--chrome-border)',
                  borderRadius: 'var(--radius)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  background: 'var(--chrome-face)',
                  transition: 'border-color 0.2s, background-color 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--hot-pink)'
                  e.currentTarget.style.backgroundColor = 'var(--pane)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--chrome-border)'
                  e.currentTarget.style.backgroundColor = 'var(--chrome-face)'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--hot-pink)', marginBottom: 6 }}>
                  {g.title}
                </div>
                <div className="tiny" style={{ color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {g.text}
                </div>
              </div>
            ))}
          </div>
          <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn ghost" style={{ fontSize: 11 }} onClick={onClose}>취소</button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
