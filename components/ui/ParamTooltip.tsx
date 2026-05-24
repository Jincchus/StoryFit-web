'use client'
import { useRef, useState } from 'react'

interface ParamTooltipProps {
  text: string
}

export default function ParamTooltip({ text }: ParamTooltipProps) {
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggle = () => {
    if (tooltipPos) { setTooltipPos(null); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const w = Math.min(230, window.innerWidth - 32)
    let left = rect.left + rect.width / 2 - w / 2
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12))
    setTooltipPos({ top: rect.top - 8, left })
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 5 }}>
      <button
        ref={btnRef}
        type="button"
        style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--chrome-border)', background: 'var(--pane)', fontSize: 9, fontWeight: 700, cursor: 'pointer', lineHeight: 1, color: 'var(--ink-soft)', padding: 0 }}
        onClick={toggle}
        onBlur={() => setTooltipPos(null)}
      >?</button>
      {tooltipPos && (
        <div style={{
          position: 'fixed',
          top: tooltipPos.top,
          left: tooltipPos.left,
          transform: 'translateY(-100%)',
          background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius)',
          padding: '8px 10px', fontSize: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          width: Math.min(230, window.innerWidth - 32), zIndex: 9999,
          boxShadow: '2px 4px 12px rgba(0,0,0,.35)',
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  )
}
