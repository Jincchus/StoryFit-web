'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { THEMES, applyTheme, getSavedTheme } from '@/lib/theme'

export default function ThemeTab() {
  const [currentTheme, setCurrentTheme] = useState('retro')
  const [themeSaved, setThemeSaved] = useState(false)
  const [wideMode, setWideMode] = useState(false)

  useEffect(() => {
    setCurrentTheme(getSavedTheme())
    setWideMode(localStorage.getItem('sf_wide') === '1')
  }, [])

  const selectTheme = async (id: string) => {
    setCurrentTheme(id)
    applyTheme(id)
    setThemeSaved(false)
    try {
      await api.patch('/api/user/settings', { theme: id })
      setThemeSaved(true)
      setTimeout(() => setThemeSaved(false), 2000)
    } catch {}
  }

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>앱 테마</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => selectTheme(t.id)}
            style={{
              appearance: 'none', cursor: 'pointer', textAlign: 'left',
              padding: 0, background: 'none', border: 'none',
            }}
          >
            <div style={{
              border: currentTheme === t.id ? '2px solid var(--hot-pink)' : '1.5px solid var(--chrome-border)',
              borderRadius: 'var(--radius)',
              padding: 8,
              background: currentTheme === t.id ? 'var(--paper-2)' : 'var(--paper)',
              display: 'flex', flexDirection: 'column', gap: 6,
              outline: currentTheme === t.id ? '1px dashed var(--hot-pink)' : 'none',
              outlineOffset: 2,
            }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {t.palette.map((c, i) => (
                  <div key={i} style={{ flex: 1, height: 24, background: c, border: '1px solid rgba(0,0,0,0.15)' }} />
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{t.label}</div>
              <div className="tiny muted" style={{ lineHeight: 1.4 }}>{t.desc}</div>
            </div>
          </button>
        ))}
      </div>
      {themeSaved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨</span>}

      {/* 레이아웃 섹션 */}
      <div className="vstack" style={{ gap: 8, marginTop: 12 }}>
        <div className="label">레이아웃</div>
        <label className="hstack" style={{ gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={wideMode}
            onChange={e => {
              const v = e.target.checked
              setWideMode(v)
              localStorage.setItem('sf_wide', v ? '1' : '0')
              // shell-wrap에 즉시 반영
              document.querySelector('.shell-wrap')?.classList.toggle('wide', v)
            }}
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>넓게 보기 (데스크톱)</div>
            <div className="tiny muted">채팅 창을 680px로 확장합니다. 작은 화면에선 효과 없음.</div>
          </div>
        </label>
      </div>
    </div>
  )
}
