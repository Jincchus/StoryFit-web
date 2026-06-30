'use client'
import { useState } from 'react'
import type { Character } from '@/types'

export default function CharacterSection({ mode, char, importedChars, allChars, personaId, onSelectChar, onAddChar, onRemoveChar }: {
  mode: 'story' | 'multiStory'
  char: Character | null
  importedChars: Character[]
  allChars: Character[]
  personaId: string | null
  onSelectChar: (c: Character) => void
  onAddChar: (c: Character) => void
  onRemoveChar: (id: string) => void
}) {
  const [charOpen, setCharOpen] = useState(false)
  const [addCharOpen, setAddCharOpen] = useState(false)
  // 페르소나 프리셋은 AI 캐릭터로 선택 불가(페르소나 피커 전용).
  const selectable = allChars.filter(c => !c.isPersonaPreset)

  return (
    <section className="new-conv-section">
      <div className="label">캐릭터 선택</div>
      {mode === 'multiStory' && importedChars.length > 0 ? (
        /* 멀티스토리 — 캐릭터 목록 편집 가능 */
        <div className="vstack" style={{ gap: 4 }}>
          {importedChars.map((c, i) => (
            <div key={c.id} className="persona-option selected" style={{ cursor: 'default' }}>
              <div className="thumb" style={{ width: 32, height: 32 }}>
                {c.avatarUrl
                  ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <span style={{fontSize:'22px', lineHeight:1}}>🎭</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 11 }}>{c.name}</div>
                <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 3).join(' · ')}</div>
              </div>
              <span style={{ fontSize: 9, color: 'var(--hot-pink)', flexShrink: 0, marginRight: 4 }}>✓ {i + 1}</span>
              <button
                className="btn ghost"
                style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }}
                onClick={() => onRemoveChar(c.id)}
              >✕</button>
            </div>
          ))}
          {/* 캐릭터 추가 */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn ghost"
              style={{ fontSize: 11, width: '100%' }}
              onClick={() => setAddCharOpen(o => !o)}
            >+ 캐릭터 추가 {addCharOpen ? '▲' : '▼'}</button>
            {addCharOpen && (
              <div style={{ border: '1px solid var(--chrome-border)', background: 'var(--win-bg)', maxHeight: 200, overflowY: 'auto' }}>
                {selectable.filter(c => !importedChars.some(ic => ic.id === c.id)).length === 0 ? (
                  <div className="tiny muted" style={{ padding: '8px 12px' }}>추가할 수 있는 캐릭터가 없습니다</div>
                ) : selectable.filter(c => !importedChars.some(ic => ic.id === c.id)).map(c => (
                  <div
                    key={c.id}
                    className="persona-option"
                    style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
                    onClick={() => { onAddChar(c); setAddCharOpen(false) }}
                  >
                    <div className="thumb" style={{ width: 28, height: 28 }}>
                      {c.avatarUrl
                        ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <span style={{fontSize:'20px', lineHeight:1}}>🎭</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 11 }}>{c.name}</div>
                      <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 3).join(' · ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 단일 캐릭터 선택 */
        <>
          <div
            className={`persona-option ${char ? 'selected' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setCharOpen(o => !o)}
          >
            {char ? (
              <>
                <div className="thumb" style={{ width: 32, height: 32 }}>
                  {char.avatarUrl
                    ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <span style={{fontSize:'22px', lineHeight:1}}>🎭</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{char.name}</div>
                  <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.tags?.slice(0, 3).join(' · ')}</div>
                </div>
              </>
            ) : (
              <div className="tiny muted" style={{ flex: 1 }}>— 캐릭터를 선택하세요 —</div>
            )}
            <span style={{ fontSize: 9, color: 'var(--ink-soft)', flexShrink: 0 }}>{charOpen ? '▲' : '▼'}</span>
          </div>
          {charOpen && (
            <div style={{ border: '1px solid var(--chrome-border)', background: 'var(--win-bg)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
              {selectable.filter(c => c.id !== personaId).map(c => (
                <div
                  key={c.id}
                  className={`persona-option ${char?.id === c.id ? 'selected' : ''}`}
                  style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
                  onClick={() => { onSelectChar(c); setCharOpen(false) }}
                >
                  <div className="thumb" style={{ width: 28, height: 28 }}>
                    {c.avatarUrl
                      ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <span style={{fontSize:'20px', lineHeight:1}}>🎭</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 11 }}>{c.name}</div>
                    <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 3).join(' · ')}</div>
                  </div>
                  {char?.id === c.id && <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
