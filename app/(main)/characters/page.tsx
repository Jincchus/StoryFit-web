'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import TagFilterBar from '@/components/ui/TagFilterBar'
import { type SortOption } from '@/lib/listSort'
import { useCharacterLibrary } from '@/lib/useCharacterLibrary'

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
  // 목록/필터/facet 계산은 훅으로 분리(lib/useCharacterLibrary). 아래 로컬 상태는 선택모드·뮤테이션 UI 전용.
  const {
    characters, setCharacters, loading, error, setError,
    view, setView, personaView, setPersonaView,
    collectionFilter, setCollectionFilter, roomFilter, setRoomFilter,
    centerFilter, setCenterFilter, genderFilter, setGenderFilter,
    sort, setSort, searchOpen, setSearchOpen, searchTab, setSearchTab,
    query, setQuery, selectedTags, toggleTag, clearTags, resetSearch,
    availableCenters, availableGenders, collections, completedRooms,
    tagGroups, tCounts, filteredCharacters, selectableInFilter,
  } = useCharacterLibrary()

  const [importing, setImporting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setError('')
    try {
      const result = await api.post('/api/characters/import', { url: importUrl.trim() })
      const char = result.character ?? result
      dispatch({ type: 'selectChar', id: char.id })
      setImportUrl('')
      setShowUrlInput(false)
      if (result.character) {
        // 새 대화 화면으로 이동 — 목록 재조회(수천 개)는 이동 후 불필요하므로 생략해 이동 지연을 없앤다.
        if (result.scenarioDescription) sessionStorage.setItem('zeta-import-scenario', result.scenarioDescription)
        if (result.tags?.length) sessionStorage.setItem('zeta-import-tags', JSON.stringify(result.tags))
        router.push('/conversations/new')
      } else {
        // 목록에 머무는 경우에만 갱신
        const refreshed = await api.get('/api/characters')
        setCharacters(refreshed)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const selectedChar = characters.find(c => c.id === draft.charId)

  // 수동 윈도잉 대신 CSS content-visibility(.char-grid > *, globals.css)로 화면 밖 카드를
  // 브라우저가 자동 스킵한다 → 전체 목록을 그대로 렌더해도 수천 개에서 프리즈가 없다.
  const scrollRef = useRef<HTMLDivElement>(null)

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
              className={`btn ${!personaView && view === v ? 'primary' : 'ghost'}`}
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => { setPersonaView(false); setView(v); setRoomFilter('all'); setCollectionFilter('all'); setCenterFilter('all'); setGenderFilter('all'); resetSearch(); exitSelect() }}
            >{v === 'active' ? '진행 중' : v === 'waiting' ? '대기' : '완결 캐릭터'}</button>
          ))}
          <button
            className={`btn ${personaView ? 'primary' : 'ghost'}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            title="가져온 제작자 페르소나 프리셋을 편집·삭제합니다"
            onClick={() => { setPersonaView(v => !v); setView('active'); setRoomFilter('all'); setCollectionFilter('all'); setCenterFilter('all'); setGenderFilter('all'); resetSearch(); exitSelect() }}
          >✨ 페르소나</button>
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
          {availableGenders.length > 1 && (
            <select
              className="field"
              style={{ fontSize: 11, width: 'auto', minWidth: 90, padding: '3px 8px' }}
              value={genderFilter}
              onChange={e => { setGenderFilter(e.target.value); exitSelect() }}
            >
              <option value="all">전체 성별</option>
              {availableGenders.map(g => (
                <option key={g.key} value={g.key}>{g.label} ({g.count})</option>
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
                ? <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={clearTags} chipClass="btn ghost" accentVar="--hot-pink" counts={tCounts} />
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
        <div className="char-grid scroll" ref={scrollRef}>
          {view === 'completed' && filteredCharacters.length === 0 && (
            <div className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 16px', fontSize: 13 }}>
              완결한 캐릭터가 없습니다.<br />이어가려면 서재에서 꺼내세요.
            </div>
          )}
          {view === 'waiting' && !personaView && filteredCharacters.length === 0 && (
            <div className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 16px', fontSize: 13 }}>
              대기 중인 캐릭터가 없습니다.<br />아직 대화를 시작하지 않은 캐릭터가 여기에 표시됩니다.
            </div>
          )}
          {personaView && filteredCharacters.length === 0 && (
            <div className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 16px', fontSize: 13 }}>
              가져온 제작자 페르소나가 없습니다.<br />Zeta·멜팅·Tikita 카드를 가져오면 여기에 표시됩니다.
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
                      ? <img src={c.avatarUrl} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
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
                    ? <img src={c.avatarUrl} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
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
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => {
                      const src = c.collection?.sourceUrl ?? ''
                      const p = src.includes('whif.io') || src.includes('whif.club') ? '?isWhif=true'
                        : src.includes('tingle.chat') ? '?isTingle=true'
                        : src.includes('melting.chat') ? '?isMelting=true'
                        : src.includes('zeta-ai.io') ? '?isZeta=true'
                        : src.includes('tikita.ai') ? '?isTikita=true'
                        : src.includes('chub.ai') || src.includes('characterhub.org') ? '?isChub=true'
                        : src.includes('rofan.ai') ? '?isRofan=true'
                        : src.includes('loveydovey.ai') ? '?isLoveydovey=true'
                        : src.includes('babechat.ai') ? '?isBabechat=true'
                        : ''
                      router.push(`/characters/${c.id}/edit${p}`)
                    }}>✏ 수정</button>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 6px' }} disabled={duplicating} onClick={e => { e.stopPropagation(); handleDuplicate(c.id) }}>⎘ 복제</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 6px' }} onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}>✕ 삭제</button>
                  </div>
                )}
              </div>
            )
          })}

          {view === 'active' && !personaView && !selecting && (
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
