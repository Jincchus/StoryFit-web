'use client'
import { useState } from 'react'
import PixelAvatar from '@/components/ui/PixelAvatar'

interface Character {
  id: string
  name: string
  gender: string
  avatarUrl: string | null
}

interface PersonaSelectModalProps {
  onSelect: (personaCharId: string | null, newPersonaName?: string) => void
  onCancel: () => void
  candidates: Character[]  // 같은 세계관 다른 캐릭터들
  excludeCharIds?: string[]
  loading?: boolean
}

export default function PersonaSelectModal({ onSelect, onCancel, candidates, loading }: PersonaSelectModalProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const activeSelection = newName.trim() ? 'new' : selected

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'var(--chrome-face)', border: '1px solid #7c3aed',
        borderRadius: 10, padding: 24, width: '100%', maxWidth: 440,
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div className="spread" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#c084fc' }}>🎭 페르소나 선택</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>대화에서 당신이 맡을 역할을 선택하세요</div>
          </div>
          <button className="btn ghost" style={{ fontSize: 12, padding: '2px 8px', flexShrink: 0 }} onClick={onCancel}>✕</button>
        </div>

        <div className="vstack" style={{ gap: 8, marginTop: 16 }}>
          {/* No persona */}
          <div
            onClick={() => { setSelected(null); setNewName('') }}
            style={{
              padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${activeSelection === null ? '#8b5cf6' : 'var(--chrome-border)'}`,
              background: activeSelection === null ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
              display: 'flex', gap: 12, alignItems: 'center',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>👤</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>페르소나 없이 시작</div>
              <div className="tiny muted">유저 자신으로 대화에 참여합니다</div>
            </div>
          </div>

          {/* Universe character candidates */}
          {candidates.length > 0 && (
            <>
              <div className="tiny" style={{ fontWeight: 700, color: '#a78bfa', marginTop: 4 }}>이 세계관의 캐릭터로 참여:</div>
              {candidates.map(c => (
                <div
                  key={c.id}
                  onClick={() => { setSelected(c.id); setNewName('') }}
                  style={{
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${activeSelection === c.id ? '#8b5cf6' : 'var(--chrome-border)'}`,
                    background: activeSelection === c.id ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                    display: 'flex', gap: 12, alignItems: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                    {c.avatarUrl
                      ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <PixelAvatar kind="custom" size={32} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                    {c.gender && <div className="tiny muted">{c.gender}</div>}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Create new persona */}
          <div style={{ marginTop: 4 }}>
            <div className="tiny" style={{ fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>또는 새 페르소나 만들기:</div>
            <input
              className="field"
              placeholder="페르소나 이름 입력 후 대화 시작"
              value={newName}
              onChange={e => { setNewName(e.target.value); if (e.target.value.trim()) setSelected(null) }}
              style={{ fontSize: 12 }}
            />
          </div>
        </div>

        <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn ghost" onClick={onCancel}>취소</button>
          <button
            className="btn primary"
            style={{ background: '#7c3aed', borderColor: '#6d28d9' }}
            disabled={loading}
            onClick={() => {
              if (newName.trim()) {
                onSelect(null, newName.trim())
              } else {
                onSelect(selected)
              }
            }}
          >{loading ? '생성 중...' : '💬 대화 시작'}</button>
        </div>
      </div>
    </div>
  )
}
