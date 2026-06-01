'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { Character } from '@/types'

let sparkleCount = 0
function sparkleAt(x: number, y: number) {
  if (sparkleCount >= 3) return
  sparkleCount++
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:18px;pointer-events:none;z-index:99;animation:pop .5s ease-out forwards`
  el.textContent = ['✦', '✧', '♡', '✿'][Math.floor(Math.random() * 4)]
  el.style.color = ['#ff2e93', '#8b5cf6', '#ff8fcf', '#ffd1ee'][Math.floor(Math.random() * 4)]
  document.body.appendChild(el)
  setTimeout(() => { el.remove(); sparkleCount-- }, 600)
}

export default function CharactersPage() {
  const router = useRouter()
  const { draft, dispatch } = useApp()
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [importUrl, setImportUrl] = useState('')

  useEffect(() => {
    api.get('/api/characters').then(data => { setCharacters(data); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setError('')
    try {
      const char = await api.post('/api/characters/import', { url: importUrl.trim() })
      setCharacters(prev => [...prev, char])
      dispatch({ type: 'selectChar', id: char.id })
      setImportUrl('')
      setShowUrlInput(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const selectedChar = characters.find(c => c.id === draft.charId)

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/characters/${id}`)
      setCharacters(prev => prev.filter(c => c.id !== id))
      if (draft.charId === id) dispatch({ type: 'selectChar', id: '' })
      setConfirmDeleteId(null)
    } catch (e: any) {
      setConfirmDeleteId(null)
      setError(e.message ?? '삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <>
    {confirmDeleteId && (
      <ConfirmDialog
        message="이 캐릭터를 삭제할까요? 복구할 수 없습니다."
        onConfirm={() => handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    )}
    <Win title="캐릭터 선택 (Character Select)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>롤플레이 상대를 선택하세요</div>
            <div className="tiny muted">프리셋 캐릭터 또는 직접 만들기</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            <button className="btn ghost" onClick={() => router.back()}>← 뒤로</button>
            <button className="btn ghost" onClick={() => setShowUrlInput(v => !v)}>↓ 카드 가져오기</button>
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

        {showUrlInput && (
          <div className="hstack" style={{ gap: 6 }}>
            <input
              className="field"
              style={{ flex: 1, fontSize: 11 }}
              placeholder="Tavern Card URL (.png 또는 .json)"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
              autoFocus
            />
            <button className="btn primary" style={{ fontSize: 11, flexShrink: 0 }} disabled={importing || !importUrl.trim()} onClick={handleImport}>
              {importing ? '가져오는 중...' : '가져오기'}
            </button>
            <button className="btn ghost" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => { setShowUrlInput(false); setImportUrl('') }}>취소</button>
          </div>
        )}

        {selectedChar && (
          <div className="char-preview-bar">
            <div className="thumb" style={{ width: 28, height: 28 }}>
              {selectedChar.avatarUrl
                ? <img src={selectedChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                : <PixelAvatar kind={selectedChar.kind} size={28} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{selectedChar.name}{selectedChar.gender && <span className="muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 10 }}>{selectedChar.gender}</span>}</div>
              {selectedChar.tags?.length > 0 && (
                <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedChar.tags.join(' · ')}</div>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="char-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8 }}>
                <div className="skeleton" style={{ width: 72, height: 72, borderRadius: 'var(--radius)' }} />
                <div className="skeleton skeleton-line medium" style={{ width: '70%' }} />
              </div>
            ))}
          </div>
        ) : (
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
              {c.tags?.length > 0
                ? <p className="tiny muted" style={{ marginTop: 2 }}>{c.tags.slice(0, 3).join(' · ')}</p>
                : <p style={{ opacity: 0 }}>—</p>
              }
              {!c.isPreset && (
                <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                  <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${c.id}/edit`)}>✏ 수정</button>
                  <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}>✕ 삭제</button>
                </div>
              )}
            </div>
          ))}

          <div className="char-card" onClick={() => router.push('/characters/new')}>
            <div className="pic-wrap" style={{ borderStyle: 'dashed' }}>
              <PixelAvatar kind="custom" size={72} />
            </div>
            <h4>커스텀 만들기</h4>
            <p>태그·추가정보로<br />직접 설정</p>
          </div>
        </div>
        )}
      </div>
    </Win>
    </>
  )
}
