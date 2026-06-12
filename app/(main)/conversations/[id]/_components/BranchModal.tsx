'use client'
import { useState } from 'react'

export default function BranchModal({ onCreate, onClose }: {
  onCreate: (description: string) => Promise<void>
  onClose: () => void
}) {
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (creating) return
    setCreating(true)
    try {
      await onCreate(desc.trim())
    } catch {
      setCreating(false)
    }
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 101, background: 'var(--paper, #fff)',
        border: '1.5px solid rgba(0,0,0,.12)', borderRadius: 12,
        padding: 20, width: 'min(320px, 90vw)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>⑂ 이 메시지에서 분기 만들기</div>
        <div className="tiny muted" style={{ lineHeight: 1.5 }}>
          이 메시지까지의 대화를 복사해 새로운 타임라인을 시작합니다.
        </div>
        <input
          className="field"
          placeholder="분기 설명 (예: 루나가 거절하는 방향)"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') create() }}
          autoFocus
          maxLength={100}
        />
        <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn ghost" style={{ fontSize: 11 }} onClick={onClose}>취소</button>
          <button className="btn primary" style={{ fontSize: 11 }} disabled={creating} onClick={create}>
            {creating ? '생성 중...' : '분기 만들기'}
          </button>
        </div>
      </div>
    </>
  )
}
