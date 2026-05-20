'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import type { Character } from '@/types'

function sparkleAt(x: number, y: number) {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:18px;pointer-events:none;z-index:99;animation:pop .5s ease-out forwards`
  el.textContent = ['✦', '✧', '♡', '✿'][Math.floor(Math.random() * 4)]
  el.style.color = ['#ff2e93', '#8b5cf6', '#ff8fcf', '#ffd1ee'][Math.floor(Math.random() * 4)]
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 600)
}

export default function CharactersPage() {
  const router = useRouter()
  const { draft, dispatch } = useApp()
  const [characters, setCharacters] = useState<Character[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/api/characters').then(setCharacters).catch(e => setError(e.message))
  }, [])

  const selectedChar = characters.find(c => c.id === draft.charId)

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.delete(`/api/characters/${id}`)
    setCharacters(prev => prev.filter(c => c.id !== id))
    if (draft.charId === id) dispatch({ type: 'selectChar', id: '' })
  }

  return (
    <Win title="캐릭터 선택 (Character Select)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>롤플레이 상대를 선택하세요</div>
            <div className="tiny muted">프리셋 캐릭터 또는 직접 만들기</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            <button className="btn ghost" onClick={() => router.push('/')}>← 뒤로</button>
            <button className="btn" onClick={() => router.push('/characters/new')}>+ 만들기</button>
            <button
              className="btn primary"
              disabled={!draft.charId}
              onClick={() => router.push('/conversations/new')}
            >
              다음 →
            </button>
          </div>
        </div>

        {error && <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 0' }}>⚠ {error}</div>}

        {selectedChar && (
          <div className="char-preview-bar">
            <div className="thumb" style={{ width: 28, height: 28 }}>
              {selectedChar.avatarUrl
                ? <img src={selectedChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                : <PixelAvatar kind={selectedChar.kind} size={28} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 700 }}>{selectedChar.name}</span>
              <span className="muted" style={{ marginLeft: 6, fontSize: 10 }}>{selectedChar.title}</span>
            </div>
          </div>
        )}

        <div className="char-grid scroll">
          {characters.map(c => (
            <div
              key={c.id}
              className={`char-card ${draft.charId === c.id ? 'selected' : ''}`}
              style={{ position: 'relative' }}
              onClick={e => { sparkleAt(e.clientX, e.clientY); dispatch({ type: 'selectChar', id: c.id }) }}
            >
              <div className="pic-wrap">
                {c.avatarUrl
                  ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <PixelAvatar kind={c.kind} size={72} />
                }
              </div>
              <h4>{c.name}</h4>
              <p>{c.title}</p>
              <div className="tag-row">
                {(c.tags ?? []).map(tag => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              {!c.isPreset && (
                <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                  <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${c.id}/edit`)}>✏ 수정</button>
                  <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => handleDelete(e, c.id)}>✕ 삭제</button>
                </div>
              )}
            </div>
          ))}

          <div className="char-card" onClick={() => router.push('/characters/new')}>
            <div className="pic-wrap" style={{ borderStyle: 'dashed' }}>
              <PixelAvatar kind="custom" size={72} />
            </div>
            <h4>커스텀 만들기</h4>
            <p>이름·성격·프롬프트<br />직접 설정</p>
          </div>
        </div>
      </div>
    </Win>
  )
}
