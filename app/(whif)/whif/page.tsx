'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import TagFilterBar from '@/components/ui/TagFilterBar'
import VirtualCardGrid from '@/components/ui/VirtualCardGrid'
import { useCenterList } from '@/lib/useCenterList'
import { useDisplayName } from '@/lib/useDisplayName'
import type { CenterListItem } from '@/lib/centerListSelect'

interface Character {
  id: string; name: string; avatarUrl: string | null; gender?: string | null
  additionalInfo: string; tags: string[]; collection?: { id: string } | null
  hasArchived?: boolean; started?: boolean; createdAt?: string
}
// 캐릭터를 CenterListItem으로 매핑(완결=부모 세계관 완결에서 파생). 원본은 _char에 보존.
type CharItem = CenterListItem & { _char: Character }

export default function WhifExplorePage() {
  const router = useRouter()
  const userName = useDisplayName()
  const [tab, setTab] = useState<'characters' | 'universes'>('universes')

  const uniHook = useCenterList({ indexQuery: 'isWhif=true', storagePrefix: 'whif_uni' })

  // 캐릭터 완결 = 부모 컬렉션(세계관) 완결. 세계관 index에서 완결 id 집합을 파생.
  const completedColIds = useMemo(
    () => new Set(uniHook.items.filter(u => u.completed).map(u => u.id)),
    [uniHook.items],
  )
  const mapChar = useCallback(
    (raw: CenterListItem[]): CenterListItem[] => (raw as unknown as Character[]).map(c => ({
      id: c.id,
      title: c.name,
      tags: c.tags ?? [],
      createdAt: c.createdAt,
      completed: !!c.collection && completedColIds.has(c.collection.id),
      started: c.started,
      characters: [{ id: c.id, name: c.name, avatarUrl: c.avatarUrl, gender: c.gender }],
      _char: c,
    } as unknown as CenterListItem)),
    [completedColIds],
  )
  const charHook = useCenterList({
    endpoint: '/api/characters', indexQuery: 'isWhif=true', appendIndexParam: false,
    favType: 'character', storagePrefix: 'whif_char', mapItems: mapChar,
  })

  const A = tab === 'universes' ? uniHook : charHook
  const { isFav, toggleFav } = uniHook

  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('whif_edit') === '1')
    setTab((sessionStorage.getItem('whif_tab') as typeof tab) || 'universes')
  }, [])

  const handleTab = (v: typeof tab) => { setTab(v); sessionStorage.setItem('whif_tab', v) }
  const refreshAll = async () => { await Promise.all([uniHook.refresh(), charHook.refresh()]) }

  const handleImport = async () => {
    const urls = importUrl.split(String.fromCharCode(10)).map(u => u.trim()).filter(Boolean)
    if (urls.length === 0 || importing) return
    setImporting(true)
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < urls.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${urls.length})`)
      try { await api.post('/api/characters/import', { url: urls[i] }); ok++ }
      catch { failed.push(urls[i]) }
    }
    setImportUrl(failed.join(String.fromCharCode(10)))
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.length}개 실패 — 다시 가져오기로 재시도` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) setMenuOpen(false)
    await refreshAll()
    setImporting(false)
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('whif_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deleteUniverse = async (id: string) => {
    if (!confirm('이 작품과 소속 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await refreshAll()
  }

  const deleteCharacter = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/characters/${id}`); await refreshAll()
  }

  const createUniverse = async () => {
    const title = prompt('새 작품 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://whif.io/local/${Date.now()}` })
    setMenuOpen(false); await refreshAll()
  }

  const renderUniverseCard = (u: CenterListItem) => {
    const thumb = u.coverImageUrl || u.characters[0]?.avatarUrl || ''
    return (
      <div key={u.id} className="whif-card" style={{ position: 'relative' }}
        onClick={() => !editMode && router.push(`/whif/universes/${u.id}`)}>
        {u.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
        {thumb ? <img className="whif-card-img" loading="lazy" decoding="async" src={thumb} alt="" /> : <div className="whif-card-img" />}
        <div className="whif-card-body">
          <div className="whif-card-title">{u.title}</div>
          <div className="whif-card-sub">{u.characters.length}명 소속</div>
          {u.tags?.length > 0 && (
            <div className="whif-card-tags">
              {u.tags.slice(0, 3).map(t => <span key={t} className="whif-chip">#{t}</span>)}
            </div>
          )}
        </div>
        {editMode ? (
          <button onClick={e => { e.stopPropagation(); deleteUniverse(u.id) }}
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
              border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
              cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        ) : (
          <button onClick={e => { e.stopPropagation(); toggleFav('collection', u.id) }}
            aria-label="즐겨찾기"
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)',
              border: 'none', color: isFav('collection', u.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 24, height: 24,
              cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isFav('collection', u.id) ? '★' : '☆'}</button>
        )}
      </div>
    )
  }

  const renderCharacterCard = (item: CenterListItem) => {
    const c = (item as CharItem)._char
    return (
      <div key={c.id} className="whif-card" style={{ position: 'relative' }}
        onClick={() => !editMode && router.push(`/whif/characters/${c.id}`)}>
        {c.hasArchived && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
        {c.avatarUrl ? <img className="whif-card-img" loading="lazy" decoding="async" src={c.avatarUrl} alt="" /> : <div className="whif-card-img" />}
        <div className="whif-card-body">
          <div className="whif-card-title">{c.name}</div>
          {c.additionalInfo?.trim() && (
            <div className="whif-card-desc">{replaceDisplayPlaceholders(c.additionalInfo, userName, c.name)}</div>
          )}
          {c.tags?.length > 0 && (
            <div className="whif-card-tags">
              {c.tags.slice(0, 3).map(t => <span key={t} className="whif-chip">#{t}</span>)}
            </div>
          )}
        </div>
        {editMode ? (
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, zIndex: 3 }}>
            <button onClick={e => { e.stopPropagation(); router.push(`/characters/${c.id}/edit?isWhif=true`) }}
              aria-label="수정"
              style={{ background: 'rgba(0,0,0,0.7)', border: 'none', color: '#c4b5fd', borderRadius: 999, width: 24, height: 24, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏</button>
            <button onClick={e => { e.stopPropagation(); deleteCharacter(c.id) }}
              style={{ background: 'rgba(0,0,0,0.7)', border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        ) : (
          <button onClick={e => { e.stopPropagation(); toggleFav('character', c.id) }}
            aria-label="즐겨찾기"
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)',
              border: 'none', color: isFav('character', c.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 24, height: 24,
              cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isFav('character', c.id) ? '★' : '☆'}</button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="whif-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="whif-iconbtn" aria-label="홈으로" onClick={() => router.push('/')}>🏠</button>
          <div className="whif-logo">WHIF</div>
        </div>
        <button className="whif-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="whif-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea className="field" placeholder="URL을 한 줄에 하나씩 붙여넣기 (여러 개 가능)" value={importUrl} onChange={e => setImportUrl(e.target.value)} rows={3} style={{ fontSize: 12, resize: 'vertical' }} />
              <button className="whif-menu-item"
                style={{ background: 'var(--w-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="whif-menu-item" onClick={createUniverse}>+ 새 작품 만들기</button>
            <button className="whif-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div className="whif-tabs">
        <button className={`whif-tab ${tab === 'universes' ? 'active' : ''}`} onClick={() => handleTab('universes')}>작품</button>
        <button className={`whif-tab ${tab === 'characters' ? 'active' : ''}`} onClick={() => handleTab('characters')}>캐릭터</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'active' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: A.view === 'active' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => A.setView('active')}>진행 중 <span style={{ opacity: 0.55 }}>{A.counts.active}</span></button>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'waiting' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: A.view === 'waiting' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => A.setView('waiting')}>대기 <span style={{ opacity: 0.55 }}>{A.counts.waiting}</span></button>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'completed' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: A.view === 'completed' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => A.setView('completed')}>완결 <span style={{ opacity: 0.55 }}>{A.counts.completed}</span></button>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: A.view === 'favorites' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: A.view === 'favorites' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => A.setView('favorites')}>★ 즐겨찾기</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: A.searchOpen ? 'var(--w-accent)' : 'var(--w-surface-2)', color: A.searchOpen ? '#fff' : 'var(--w-ink-soft)' }} onClick={A.toggleSearch}>🔍 검색</button>
          <select
            className="field"
            style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
            value={A.sort}
            onChange={e => A.setSort(e.target.value as typeof A.sort)}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
          </select>
        </div>
      </div>

      {A.searchOpen && (
        <>
          <div style={{ padding: '0 16px 8px' }}>
            <input
              className="field"
              style={{ fontSize: 12, width: '100%' }}
              placeholder={tab === 'universes' ? '제목으로 검색' : '이름으로 검색'}
              value={A.query}
              onChange={e => A.setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {tab === 'characters' && A.genderBuckets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>성별</span>
              <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: A.genderFilter === 'all' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: A.genderFilter === 'all' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => A.setGenderFilter('all')}>전체</button>
              {A.genderBuckets.map(g => (
                <button key={g.key} className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: A.genderFilter === g.key ? 'var(--w-accent)' : 'var(--w-surface-2)', color: A.genderFilter === g.key ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => A.setGenderFilter(g.key)}>{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          <TagFilterBar groups={A.tagGroups} selected={A.selectedTags} onToggle={A.toggleTag} onClear={A.clearTags} chipClass="whif-chip" accentVar="--w-accent" counts={A.tCounts} storageKey="whif_tagcollapse" />
        </>
      )}

      <div className="whif-scroll" ref={A.scrollRef}>
        {A.loading ? (
          <div className="whif-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="whif-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 0 }} />
                <div className="whif-card-body">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : A.error && A.items.length === 0 ? (
          <div className="whif-empty">{A.error}<br /><button className="whif-chip" style={{ cursor:'pointer', border:'none', background:'var(--w-accent)', color:'#fff', marginTop:8 }} onClick={() => A.refresh()}>다시 시도</button></div>
        ) : A.visibleChars.length === 0 ? (
          A.selectedTags.length > 0 || A.query.trim()
            ? <div className="whif-empty">검색 결과가 없습니다.</div>
          : A.view === 'favorites'
            ? <div className="whif-empty">즐겨찾기한 {tab === 'universes' ? '작품' : '캐릭터'}이 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
          : A.view === 'completed'
            ? <div className="whif-empty">완결한 {tab === 'universes' ? '작품' : '캐릭터'}이 없습니다.</div>
            : A.view === 'waiting'
              ? <div className="whif-empty">대기 중인 {tab === 'universes' ? '작품' : '캐릭터'}이 없습니다.</div>
              : A.items.length === 0
                ? (tab === 'universes'
                    ? <div className="whif-empty">가져온 작품이 없습니다<br />⋮ 메뉴에서 WHIF URL로 가져오세요.</div>
                    : <div className="whif-empty">가져온 캐릭터가 없습니다.</div>)
                : <div className="whif-empty">진행 중인 {tab === 'universes' ? '작품' : '캐릭터'}이 없습니다.</div>
        ) : (
          <VirtualCardGrid
            items={A.visibleChars}
            renderItem={tab === 'universes' ? renderUniverseCard : renderCharacterCard}
            scrollRef={A.scrollRef}
            imageHeightRatio={4 / 3}
            bodyHeight={100}
            columns={2}
            gap={12}
            padX={16}
          />
        )}
      </div>
    </>
  )
}
