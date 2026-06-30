'use client'
import { useState } from 'react'
import type { Character } from '@/types'

export default function PersonaSection({ mode, char, importedChars, allChars, personaId, onSelect }: {
  mode: 'story' | 'multiStory'
  char: Character | null
  importedChars: Character[]
  allChars: Character[]
  personaId: string | null
  onSelect: (id: string | null) => void
}) {
  const [personaOpen, setPersonaOpen] = useState(false)
  const selectedPersona = allChars.find(c => c.id === personaId)

  return (
    <section className="new-conv-section">
      <div className="label">내 역할 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
      <div
        className="persona-option"
        style={{ cursor: 'pointer' }}
        onClick={() => setPersonaOpen(o => !o)}
      >
        {selectedPersona ? (
          <>
            <div className="thumb" style={{ width: 32, height: 32 }}>
              {selectedPersona.avatarUrl
                ? <img src={selectedPersona.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : <span style={{fontSize:'20px', lineHeight:1}}>🎭</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 11 }}>{selectedPersona.name}</div>
              <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPersona.tags?.slice(0, 3).join(' · ')}</div>
            </div>
          </>
        ) : (
          <>
            <div className="thumb" style={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }}>
              <span style={{fontSize:'20px', lineHeight:1}}>🧑</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 11 }}>없음</div>
              <div className="tiny muted">기본 유저로 대화</div>
            </div>
          </>
        )}
        <span style={{ fontSize: 9, color: 'var(--ink-soft)', flexShrink: 0 }}>{personaOpen ? '▲' : '▼'}</span>
      </div>
      {personaOpen && (
        <div style={{ border: '1px solid var(--chrome-border)', background: 'var(--win-bg)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
          <div
            className={`persona-option ${!personaId ? 'selected' : ''}`}
            style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
            onClick={() => { onSelect(null); setPersonaOpen(false) }}
          >
            <div className="thumb" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center' }}>
              <span style={{fontSize:'18px', lineHeight:1}}>🧑</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 11 }}>없음</div>
              <div className="tiny muted">기본 유저로 대화</div>
            </div>
            {!personaId && <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>}
          </div>
          {allChars.filter(c => mode === 'multiStory'
            ? !importedChars.some(ic => ic.id === c.id)
            : c.id !== char?.id
          ).sort((a, b) => Number(!!b.isPersonaPreset) - Number(!!a.isPersonaPreset)).map(c => (
            <div
              key={c.id}
              className={`persona-option ${personaId === c.id ? 'selected' : ''}`}
              style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
              onClick={() => { onSelect(c.id); setPersonaOpen(false) }}
            >
              <div className="thumb" style={{ width: 28, height: 28 }}>
                {c.avatarUrl
                  ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <span style={{fontSize:'18px', lineHeight:1}}>🎭</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {c.name}
                  {c.isPersonaPreset && <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--hot-pink)', border: '1px solid var(--hot-pink)', borderRadius: 3, padding: '0 3px', flexShrink: 0 }}>추천</span>}
                </div>
                <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 3).join(' · ')}</div>
              </div>
              {personaId === c.id && <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
