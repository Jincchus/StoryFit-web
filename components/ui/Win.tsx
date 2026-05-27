'use client'
import type { ReactNode } from 'react'

interface WinProps {
  title: string
  icon?: ReactNode
  controls?: boolean
  noTitle?: boolean
  onClose?: () => void
  children: ReactNode
  className?: string
  titlebarExtra?: ReactNode
}

export default function Win({ title, icon, controls = true, noTitle = false, onClose, children, className = '', titlebarExtra = null }: WinProps) {
  return (
    <div className={`win ${className}`}>
      {!noTitle && (
        <div className="win-title">
          <div className="win-title-l">
            {icon ?? null}
            <span>{title}</span>
          </div>
          {titlebarExtra}
          {controls && (
            <div className="win-controls">
              <button title="닫기" onClick={onClose}>×</button>
            </div>
          )}
        </div>
      )}
      <div className="win-body">{children}</div>
    </div>
  )
}
