'use client'
import type { ReactNode } from 'react'

interface WinProps {
  title: string
  icon?: ReactNode
  controls?: boolean
  onClose?: () => void
  children: ReactNode
  className?: string
  titlebarExtra?: ReactNode
}

export default function Win({ title, icon, controls = true, onClose, children, className = '', titlebarExtra = null }: WinProps) {
  return (
    <div className={`win ${className}`}>
      <div className="win-title">
        <div className="win-title-l">
          {icon ?? null}
          <span>{title}</span>
        </div>
        {titlebarExtra}
        {controls && (
          <div className="win-controls">
            <button title="최소화">_</button>
            <button title="최대화">▢</button>
            <button title="닫기" onClick={onClose}>×</button>
          </div>
        )}
      </div>
      <div className="win-body">{children}</div>
    </div>
  )
}
