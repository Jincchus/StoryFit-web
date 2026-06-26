'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import TagFilterBar from '@/components/ui/TagFilterBar'
import { sortByOption, type SortOption } from '@/lib/listSort'
import { buildTagGroups, type CenterTagConfig } from '@/lib/tagGroups'
import { tagCounts } from '@/lib/centerCounts'
import { CENTERS } from '@/lib/centers'
import type { Character } from '@/types'

// 캐릭터가 속한 센터 키를 collection.sourceUrl로 판별. 컬렉션이 없거나 외부 센터가 아니면 'none'(미분류).
function centerKeyOf(c: Character): string {
  const url = c.collection?.sourceUrl ?? ''
  if (!url) return 'none'
  return CENTERS.find(ctr => ctr.dbHosts.some(h => url.includes(h)))?.key ?? 'none'
}

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

function RoomChips({ rooms }: { rooms?: { id: string; title: string }[] }) {
  if (!rooms || rooms.length === 0) return null
  const shown = rooms.slice(0, 2)
  const extra = rooms.length - shown.length
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginTop: 2 }}>
      {shown.map(r => (
        <span key={r.id} style={{ fontSize: 9, fontWeight: 700, background: '#4fa8e8', color: '#fff', padding: '1px 5px', borderRadius: 3, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
      ))}
      {extra > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-soft)' }}>+{extra}</span>}
    </div>
  )
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
  const [view, setView] = useState<'active' | 'waiting' | 'completed'>('active')
  const [duplicating, setDuplicating] = useState(false)
  const [roomFilter, setRoomFilter] = useState<string>('all')
  const [centerFilter, setCenterFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortOption>('latest')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTab, setSearchTab] = useState<'text' | 'tag'>('text')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)

  useEffect(() => {
    api.get('/api/characters').then(data => { setCharacters(data); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
    api.get('/api/center-tags').then(setTagConfig).catch(() => {})
  }, [])

  const toggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  const resetSearch = () => { setQuery(''); setSelectedTags([]) }

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

  // view(진행/대기/완결) 기준 1차 분류
  const viewBase = useMemo(() => {
    if (view === 'completed') return characters.filter(c => c.completed)
    if (view === 'waiting') return characters.filter(c => !c.completed && !c.started)
    return characters.filter(c => !c.completed && c.started)
  }, [characters, view])

  // 센터 필터 옵션 (이 view에 실제로 멤버가 있는 센터만, 카운트 포함)
  const availableCenters = useMemo(() => {
    const counts = new Map<string, number>()
    viewBase.forEach(c => { const k = centerKeyOf(c); counts.set(k, (counts.get(k) ?? 0) + 1) })
    const list = CENTERS.filter(ctr => counts.has(ctr.key)).map(ctr => ({ key: ctr.key, label: ctr.label, count: counts.get(ctr.key)! }))
    if (counts.has('none')) list.push({ key: 'none', label: '미분류·직접만든', count: counts.get('none')! })
    return list
  }, [viewBase])

  // 센터 필터 적용 (완결 view는 센터 대신 방 필터를 쓰므로 그대로)
  const centerBase = useMemo(() => {
    if (view === 'completed' || centerFilter === 'all') return viewBase
    return viewBase.filter(c => centerKeyOf(c) === centerFilter)
  }, [viewBase, centerFilter, view])

  // 카드(컬렉션) 드롭다운 옵션 — 센터 필터 적용된 집합에서
  const collections = useMemo(() => {
    const map = new Map<string, string>()
    centerBase.forEach(c => { if (c.collection) map.set(c.collection.id, c.collection.title) })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [centerBase])

  const completedRooms = useMemo(() => {
    const map = new Map<string, string>()
    characters.filter(c => c.completed).forEach(c => {
      c.rooms?.forEach(r => map.set(r.id, r.title))
    })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [characters])

  // 태그 검색용 — 현재 필터된 집합에 등록된 태그 목록 + 카운트
  const tagGroups = useMemo(() => buildTagGroups(centerBase.flatMap(c => c.tags ?? []), tagConfig), [centerBase, tagConfig])
  const tCounts = useMemo(() => tagCounts(centerBase), [centerBase])

  const filteredCharacters = useMemo(() => {
    let r = centerBase
    if (view === 'completed') {
      if (roomFilter !== 'all') r = r.filter(c => c.rooms?.some(rm => rm.id === roomFilter))
    } else {
      if (collectionFilter === 'none') r = r.filter(c => !c.collection && !c.isPreset)
      else if (collectionFilter !== 'all') r = r.filter(c => c.collection?.id === collectionFilter)
    }
    // 검색: 이름·카드명 텍스트
    const q = query.trim().toLowerCase()
    if (q) r = r.filter(c => c.name.toLowerCase().includes(q) || (c.collection?.title ?? '').toLowerCase().includes(q))
    // 검색: 태그 (선택 태그를 모두 가진 캐릭터)
    if (selectedTags.length > 0) r = r.filter(c => selectedTags.every(t => (c.tags ?? []).includes(t)))
    // 정렬
    return sortByOption(r, sort, c => c.name, c => c.createdAt ?? '', c => c.createdAt ?? '')
  }, [centerBase, view, collectionFilter, roomFilter, query, selectedTags, sort])

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

  const handleDuplicate = async (id: string) => {
    if (duplicating) return
    setDuplicating(true)
    try {
      await api.post(`/api/characters/${id}/duplicate`, {})
      const refreshed = await api.get('/api/characters')
      setCharacters(refreshed)
      setView('active')
    } catch (e: any) {
      setError(e.message ?? '복제 중 오류가 발생했습니다.')
    } finally {
      setDuplicating(false)
    }
  }

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
            ) : view === 'completed' ? null : (
              <>
                {selectableInFilter.length > 0 && (
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setSelecting(true)}>☑ 선택</button>
                )}
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

        <div className="hstack" style={{ gap: 6 }}>
          {(['active', 'waiting', 'completed'] as const).map(v => (
            <button
              key={v}
              className={`btn ${view === v ? 'primary' : 'ghost'}`}
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => { setView(v); setRoomFilter('all'); setCollectionFilter('all'); setCenterFilter('all'); resetSearch(); exitSelect() }}
            >{v === 'active' ? '진행 중' : v === 'waiting' ? '대기' : '완결 캐릭터'}</button>
          ))}
        </div>

        {error && <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 0' }}>⚠ {error}</div>}

        {/* 센터 필터 · 정렬 · 검색 */}
        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          {view !== 'completed' && availableCenters.length > 0 && (
            <select
              className="field"
              style={{ fontSize: 11, width: 'auto', minWidth: 110, padding: '3px 8px' }}
              value={centerFilter}
              onChange={e => { setCenterFilter(e.target.value); setCollectionFilter('all'); exitSelect() }}
            >
              <option value="all">전체 센터</option>
              {availableCenters.map(ctr => (
                <option key={ctr.key} value={ctr.key}>{ctr.label} ({ctr.count})</option>
              ))}
            </select>
          )}
          <select
            className="field"
            style={{ fontSize: 11, width: 'auto', minWidth: 90, padding: '3px 8px' }}
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
          </select>
          <button
            className={`btn ${searchOpen ? 'primary' : 'ghost'}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => setSearchOpen(o => { if (o) resetSearch(); return !o })}
          >🔍 검색{(query.trim() || selectedTags.length > 0) ? ` (${(query.trim() ? 1 : 0) + selectedTags.length})` : ''}</button>
        </div>

        {searchOpen && (
          <div className="vstack" style={{ gap: 6 }}>
            <div className="hstack" style={{ gap: 6 }}>
              <button className={`btn ${searchTab === 'text' ? 'primary' : 'ghost'}`} style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setSearchTab('text')}>이름·카드명</button>
              <button className={`btn ${searchTab === 'tag' ? 'primary' : 'ghost'}`} style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setSearchTab('tag')}>태그</button>
            </div>
            {searchTab === 'text' ? (
              <input
                className="field"
                style={{ fontSize: 12, width: '100%' }}
                placeholder="캐릭터명 또는 카드(세계관)명으로 검색"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            ) : (
              tagGroups.length > 0
                ? <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} chipClass="btn ghost" accentVar="--hot-pink" counts={tCounts} />
                : <div className="tiny muted" style={{ padding: '4px 0' }}>등록된 태그가 없습니다.</div>
            )}
          </div>
        )}

        {view !== 'completed' && collections.length > 0 && (
          <select
            className="field"
            style={{ fontSize: 11, width: 'auto', minWidth: 120, padding: '3px 8px' }}
            value={collectionFilter}
            onChange={e => { setCollectionFilter(e.target.value); exitSelect() }}
          >
            <option value="all">전체</option>
            <option value="none">미분류</option>
            {collections.map(col => (
              <option key={col.id} value={col.id}>{col.title}</option>
            ))}
          </select>
        )}

        {view === 'completed' && completedRooms.length > 0 && (
          <select
            className="field"
            style={{ fontSize: 11, width: 'auto', minWidth: 120, padding: '3px 8px' }}
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
          >
            <option value="all">전체</option>
            {completedRooms.map(r => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        )}

        {view !== 'completed' && selectedChar && !selecting && (
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
          {view === 'completed' && filteredCharacters.length === 0 && (
            <div className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 16px', fontSize: 13 }}>
              완결한 캐릭터가 없습니다.<br />이어가려면 서재에서 꺼내세요.
            </div>
          )}
          {view === 'waiting' && filteredCharacters.length === 0 && (
            <div className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 16px', fontSize: 13 }}>
              대기 중인 캐릭터가 없습니다.<br />아직 대화를 시작하지 않은 캐릭터가 여기에 표시됩니다.
            </div>
          )}
          {filteredCharacters.map(c => {
            const isChecked = selected.has(c.id)
            if (view === 'completed') {
              return (
                <div key={c.id} className="char-card" style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>
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
                  <RoomChips rooms={c.rooms} />
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} disabled={duplicating} onClick={() => handleDuplicate(c.id)}>⎘ 복제</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteId(c.id)}>✕ 삭제</button>
                  </div>
                </div>
              )
            }
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
                {!c.isPreset && !c.isAutoCreated && (
                  <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 4, fontSize: 9, fontWeight: 700, background: '#2ea66b', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>추가된 캐릭터</div>
                )}
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
                <RoomChips rooms={c.rooms} />
                {!c.isPreset && !selecting && (
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${c.id}/edit`)}>✏ 수정</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}>✕ 삭제</button>
                  </div>
                )}
              </div>
            )
          })}

          {view === 'active' && !selecting && (
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
