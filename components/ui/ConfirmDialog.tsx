import { useEffect } from 'react'

interface Props {
  message: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, confirmLabel = '삭제', onConfirm, onCancel }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div className="win" style={{ minWidth: 240, maxWidth: 320 }} onClick={e => e.stopPropagation()}>
        <div className="win-title">
          <div className="win-title-l"><span>확인</span></div>
          <div className="win-controls"><button onClick={onCancel}>×</button></div>
        </div>
        <div className="win-body vstack" style={{ gap: 14 }}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{message}</div>
          <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn ghost" autoFocus onClick={onCancel}>취소</button>
            <button className="btn danger" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
