'use client'
import { useState } from 'react'

interface ParamTooltipProps {
  text: string
}

export default function ParamTooltip({ text }: ParamTooltipProps) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 5 }}>
      <button
        type="button"
        style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--chrome-border)', background: 'var(--pane)', fontSize: 9, fontWeight: 700, cursor: 'pointer', lineHeight: 1, color: 'var(--ink-soft)', padding: 0 }}
        onClick={() => setShow(s => !s)}
        onBlur={() => setShow(false)}
      >?</button>
      {show && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius)',
          padding: '7px 10px', fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          width: 220, zIndex: 50, boxShadow: '2px 2px 0 rgba(0,0,0,.2)',
          pointerEvents: 'none',
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid var(--ink)` }} />
        </div>
      )}
    </span>
  )
}
