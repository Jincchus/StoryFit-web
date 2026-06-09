'use client'
import { useEffect, useMemo, useState } from 'react'
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
  const [collectionFilter, setCollectionFilter] = useState<string>('all')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)

  useEffect(() => {
    api.get('/api/characters').then(data => { setCharacters(data); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setError('')
    try {
      const result = await api.post('/api/characters/import', { url: importUrl.trim() })
      const refreshed = await api.get('/api/characters')
      setCharacters(refreshed)
      const char = result.character ?? result
      dispatch({ type: 'selectChar', id: char.id })
      setImportUrl('')
      setShowUrlInput(false)
      if (result.character) {
        if (result.scenarioDescription) sessionStorage.setItem('zeta-import-scenario', result.scenarioDescription)
        if (result.tags?.length) sessionStorage.setItem('zeta-import-tags', JSON.stringify(result.tags))
        router.push('/conversations/new')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const selectedChar = characters.find(c => c.id === draft.charId)

  const collections = useMemo(() => {
    const map = new Map<string, string>()
    characters.forEach(c => {
      if (c.collection) map.set(c.collection.id, c.collection.title)
    })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [characters])

  const filteredCharacters = useMemo(() => {
    if (collectionFilter === 'all') return characters
    if (collectionFilter === 'none') return characters.filter(c => !c.collection && !c.isPreset)
    return characters.filter(c => c.collection?.id === collectionFilter)
  }, [characters, collectionFilter])

  const selectableInFilter = filteredCharacters.filter(c => !c.isPreset)

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === selectableInFilter.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableInFilter.map(c => c.id)))
    }
  }

  const exitSelect = () => { setSelecting(false); setSelected(new Set()) }

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

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleting) return
    setDeleting(true)
    setConfirmBulk(false)
    try {
      await Promise.all(Array.from(selected).map(id => api.delete(`/api/characters/${id}`)))
      setCharacters(prev => prev.filter(c => !selected.has(c.id)))
      if (draft.charId && selected.has(draft.charId)) dispatch({ type: 'selectChar', id: '' })
      exitSelect()
    } catch (e: any) {
      setError(e.message ?? '삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleting(false)
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
    {confirmBulk && (
      <ConfirmDialog
        message={`선택한 캐릭터 ${selected.size}개를 삭제할까요? 복구할 수 없습니다.`}
        onConfirm={handleDeleteSelected}
        onCancel={() => setConfirmBulk(false)}
      />
    )}
    <Win title="캐릭터 선택 (Character Select)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="hstack" style={{ gap: 8, minWidth: 0, flex: '1 1 auto' }}>
            {!selecting && (
              <button className="btn ghost" style={{ flexShrink: 0, padding: '4px 8px' }} onClick={() => router.back()}>←</button>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>롤플레이 상대를 선택하세요</div>
              <div className="tiny muted">프리셋 캐릭터 또는 직접 만들기</div>
            </div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            {selecting ? (
              <>
                <button className="btn ghost" style={{ fontSize: 10 }} onClick={toggleAll}>
                  {selected.size === selectableInFilter.length ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  className="btn danger"
                  style={{ fontSize: 10 }}
                  disabled={selected.size === 0 || deleting}
                  onClick={() => setConfirmBulk(true)}
                >
                  {deleting ? '삭제 중...' : `✕ 삭제 (${selected.size})`}
                </button>
                <button className="btn ghost" style={{ fontSize: 10 }} onClick={exitSelect}>취소</button>
              </>
            ) : (
              <>
                {selectableInFilter.length > 0 && (
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setSelecting(true)}>☑ 선택</button>
                )}
                <button className="btn" style={{ background: '#8b5cf6', color: '#fff', border: '1px solid #7c3aed', fontSize: 11 }} onClick={() => router.push('/whif')}>🪐 WHIF</button>
                <button className="btn" style={{ background: '#7c5cff', color: '#fff', border: '1px solid #6a4eef', fontSize: 11 }} onClick={() => router.push('/zeta')}>⚡ ZETA</button>
                <button className="btn" style={{ background: '#ff2e93', color: '#fff', border: '1px solid #e0257f', fontSize: 11 }} onClick={() => router.push('/melting')}>🔥 MELTING</button>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => router.push('/characters/new')}>+ 만들기</button>
                <button
                  className="btn primary"
                  style={{ fontSize: 11 }}
                  disabled={!draft.charId}
                  onClick={() => router.push('/conversations/new')}
                >
                  다음 →
                </button>
              </>
            )}
          </div>
        </div>

        {error && <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 0' }}>⚠ {error}</div>}

        {collections.length > 0 && (
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: '전체' },
              { id: 'none', label: '미분류' },
              ...collections.map(col => ({ id: col.id, label: col.title })),
            ].map(tab => (
              <button
                key={tab.id}
                className={`btn ${collectionFilter === tab.id ? 'primary' : 'ghost'}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => { setCollectionFilter(tab.id); exitSelect() }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {selectedChar && !selecting && (
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
          {filteredCharacters.map(c => {
            const isChecked = selected.has(c.id)
            return (
              <div
                key={c.id}
                className={`char-card ${!selecting && draft.charId === c.id ? 'selected' : ''}`}
                style={{
                  position: 'relative',
                  ...(c.isAutoCreated ? { background: 'rgba(0,140,255,0.06)', borderColor: '#4fa8e8' } : {}),
                  ...(selecting && isChecked ? { background: 'var(--lavender)', borderColor: 'var(--hot-pink)' } : {}),
                  cursor: selecting ? 'pointer' : undefined,
                }}
                onClick={e => {
                  if (selecting) {
                    if (!c.isPreset) toggleSelect(c.id)
                    return
                  }
                  sparkleAt(e.clientX, e.clientY)
                  dispatch({ type: 'selectChar', id: c.id })
                }}
              >
                {selecting && !c.isPreset && (
                  <div style={{
                    position: 'absolute', top: 6, left: 6, zIndex: 5,
                    width: 18, height: 18,
                    border: `2px solid ${isChecked ? 'var(--hot-pink)' : 'var(--chrome-border)'}`,
                    background: isChecked ? 'var(--hot-pink)' : 'rgba(0,0,0,0.5)',
                    borderRadius: 3,
                    display: 'grid', placeItems: 'center',
                  }}>
                    {isChecked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </div>
                )}
                {c.collection && (
                  <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, fontWeight: 700, background: '#4fa8e8', color: '#fff', padding: '1px 5px', borderRadius: 3, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.collection.title}</div>
                )}
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
                {!c.isPreset && !selecting && (
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${c.id}/edit`)}>✏ 수정</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}>✕ 삭제</button>
                  </div>
                )}
              </div>
            )
          })}

          {!selecting && (
            <div className="char-card" onClick={() => router.push('/characters/new')}>
              <div className="pic-wrap" style={{ borderStyle: 'dashed' }}>
                <PixelAvatar kind="custom" size={72} />
              </div>
              <h4>커스텀 만들기</h4>
              <p>태그·추가정보로<br />직접 설정</p>
            </div>
          )}
        </div>
        )}
      </div>
    </Win>
    </>
  )
}
