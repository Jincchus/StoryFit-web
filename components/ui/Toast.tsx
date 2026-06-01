'use client'
import { useEffect, useState } from 'react'

interface Props {
  message: string
  type?: 'success' | 'error' | 'info'
  onDone: () => void
}

const TYPE_CONFIG = {
  success: { icon: '✓', color: '#22a06b', border: '1.5px solid #22a06b' },
  error:   { icon: '⚠', color: '#ff6b8a', border: '1.5px solid #ff6b8a' },
  info:    { icon: 'ℹ', color: 'var(--ink)', border: '1.5px solid var(--chrome-border)' },
}

export default function Toast({ message, type = 'success', onDone }: Props) {
  const [visible, setVisible] = useState(true)
  const cfg = TYPE_CONFIG[type]

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 1800)
    const t2 = setTimeout(onDone, 2100)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--chrome-face)', border: cfg.border,
      borderRadius: 'var(--radius)', padding: '7px 18px', fontSize: 12, fontWeight: 600,
      zIndex: 3000, boxShadow: '0 2px 10px rgba(0,0,0,.35)',
      transition: 'opacity .3s', opacity: visible ? 1 : 0,
      whiteSpace: 'nowrap', color: cfg.color,
    }}>
      {cfg.icon} {message}
    </div>
  )
}
