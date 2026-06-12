'use client'
import { useState, useRef, useEffect } from 'react'
import { AI_MODELS } from '@/lib/constants'
import type { AIProvider } from '@/types'

interface AiPillProps {
  modelId: AIProvider
  onChange?: (id: AIProvider) => void
}

const DOT_COLOR: Record<AIProvider, string> = {
  gemini: '#c9b6ff',
}

export default function AiPill({ modelId, onChange }: AiPillProps) {
  const [open, setOpen] = useState(false)
  const m = AI_MODELS.find(x => x.id === modelId) ?? AI_MODELS[0]
  const ref = useRef<HTMLDivElement>(null)

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
      <button className="ai-pill" onClick={() => setOpen(o => !o)}>
        <span className="dot" style={{ background: DOT_COLOR[m.id] }} />
        {m.short} ▾
      </button>
      {open && (
        <div className="ai-dropdown">
          {AI_MODELS.map(opt => (
            <div
              key={opt.id}
              className={`ai-dropdown-item ${opt.id === modelId ? 'active' : ''} ${opt.disabled ? 'disabled' : ''}`}
              onClick={() => { if (!opt.disabled) { onChange?.(opt.id); setOpen(false) } }}
            >
              <span>{opt.name}</span>
              {opt.disabled && <span className="tiny muted">(v2)</span>}
              {opt.id === modelId && !opt.disabled && <span>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
