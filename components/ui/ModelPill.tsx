'use client'
import { useState, useRef, useEffect } from 'react'
import { CHAT_MODEL_OPTIONS, GEMINI_CHAT_MODEL } from '@/lib/constants'

// 채팅 헤더의 모델 선택 드롭다운. value=null이면 기본 모델로 표시.
export default function ModelPill({ value, onChange }: { value?: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cur = value || GEMINI_CHAT_MODEL
  const m = CHAT_MODEL_OPTIONS.find(x => x.id === cur) ?? CHAT_MODEL_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="ai-pill" onClick={() => setOpen(o => !o)} title="채팅 모델 선택"
        style={{ height: 32, fontSize: 11, padding: '0 10px' }}>
        ✨ {m.short} ▾
      </button>
      {open && (
        <div className="ai-dropdown">
          {CHAT_MODEL_OPTIONS.map(opt => (
            <div
              key={opt.id}
              className={`ai-dropdown-item ${opt.id === cur ? 'active' : ''}`}
              onClick={() => { onChange(opt.id); setOpen(false) }}
            >
              <span>{opt.label}</span>
              {opt.id === cur && <span>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
