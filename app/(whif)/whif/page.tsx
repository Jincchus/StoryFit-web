'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { sortByOption, type SortOption } from '@/lib/listSort'
import { useScrollRestore } from '@/lib/useScrollRestore'
import { useInfiniteScroll } from '@/lib/useInfiniteScroll'
import TagFilterBar from '@/components/ui/TagFilterBar'
import { buildTagGroups, type CenterTagConfig } from '@/lib/tagGroups'
import { genderBucket, CARD_GENDER_LABEL } from '@/lib/cardGender'
import { useFavorites } from '@/lib/useFavorites'
import { viewCounts, tagCounts } from '@/lib/centerCounts'
import { useDisplayName } from '@/lib/useDisplayName'

interface Character { id: string; name: string; avatarUrl: string | null; gender?: string | null; additionalInfo: string; tags: string[]; collection?: { id: string } | null; hasArchived?: boolean; started?: boolean; createdAt?: string }
interface Universe { id: string; title: string; coverImageUrl: string; tags: string[]; characters: { id: string; name: string; avatarUrl: string | null }[]; completed?: boolean; started?: boolean; createdAt?: string; lastActivityAt?: string }

export default function WhifExplorePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'characters' | 'universes'>('universes')
  const [view, setView] = useState<'active' | 'waiting' | 'completed' | 'favorites'>('active')
  const { isFav, toggleFav } = useFavorites()
  const userName = useDisplayName()
  const [universes, setUniverses] = useState<Universe[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [sortUniverses, setSortUniverses] = useState<SortOption>('latest')
  const [sortCharacters, setSortCharacters] = useState<SortOption>('latest')
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)
  const [genderFilter, setGenderFilter] = useState<string>('all')
  const toggleSearch = () => setSearchOpen(o => { if (o) { setQuery(''); setSelectedTags([]); setGenderFilter('all') } return !o })

  useEffect(() => {
    setEditMode(localStorage.getItem('whif_edit') === '1')
    setSortUniverses((localStorage.getItem('whif_sort_universes') as SortOption) || 'latest')
    setSortCharacters((localStorage.getItem('whif_sort_characters') as SortOption) || 'latest')
    setTab((sessionStorage.getItem('whif_tab') as typeof tab) || 'universes')
    setView((sessionStorage.getItem('whif_view') as typeof view) || 'active')
    fetchData()
    api.get('/api/center-tags').then(setTagConfig).catch(() => {})
  }, [])

  const handleSortUniverses = (v: SortOption) => {
    setSortUniverses(v); localStorage.setItem('whif_sort_universes', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }
  const handleSortCharacters = (v: SortOption) => {
    setSortCharacters(v); localStorage.setItem('whif_sort_characters', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }
  const handleTab = (v: typeof tab) => {
    setTab(v); setSelectedTags([]); setGenderFilter('all'); sessionStorage.setItem('whif_tab', v)
  }
  const handleView = (v: typeof view) => {
    setView(v); sessionStorage.setItem('whif_view', v)
  }

  const scrollRef = useScrollRestore(`whif_scroll_${tab}_${view}`, !loading)
  const { count, sentinelRef } = useInfiniteScroll([tab, view, query, selectedTags, genderFilter, sortUniverses, sortCharacters, randomSeed], scrollRef)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [u, c] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
      ])
      setUniverses(u); setCharacters(c)
    } finally { setLoading(false) }
  }

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
    await fetchData()
    setImporting(false)
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('whif_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deleteUniverse = async (id: string) => {
    if (!confirm('이 작품과 소속 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  const deleteCharacter = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/characters/${id}`); await fetchData()
  }

  const createUniverse = async () => {
    const title = prompt('새 작품 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://whif.io/local/${Date.now()}` })
    setMenuOpen(false); await fetchData()
  }

  const completedColIds = new Set(universes.filter(u => u.completed).map(u => u.id))
  const isCharCompleted = (c: Character) => !!c.collection && completedColIds.has(c.collection.id)
  const matchesTag = (tags: string[]) => selectedTags.length === 0 || selectedTags.every(t => tags.includes(t))
  const matchesQuery = (title: string, tags: string[] = []) => { const q = query.trim().toLowerCase(); return !q || title.toLowerCase().includes(q) || tags.some(t => t.toLowerCase().includes(q)) }
  const toggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  const tagGroups = buildTagGroups((tab === 'universes' ? universes : characters).flatMap(item => item.tags ?? []), tagConfig)
  const counts = tab === 'universes' ? viewCounts(universes) : viewCounts(characters, isCharCompleted)
  const tCounts = tab === 'universes' ? tagCounts(universes) : tagCounts(characters)
  // 성별 필터는 캐릭터 탭에서만 (개별 캐릭터라 멀티 없음)
  const genderBuckets = (() => {
    if (tab !== 'characters') return [] as { key: string; label: string; count: number }[]
    const cnt = new Map<string, number>()
    characters.forEach(c => { const b = genderBucket(c.gender); cnt.set(b, (cnt.get(b) ?? 0) + 1) })
    return (['male', 'female', 'none'] as const).filter(b => cnt.has(b)).map(b => ({ key: b, label: CARD_GENDER_LABEL[b], count: cnt.get(b)! }))
  })()
  const visibleUniverses = sortByOption(
    universes.filter(u =>
      (view === 'favorites' ? isFav('collection', u.id)
      : view === 'completed' ? u.completed
      : view === 'waiting' ? !u.started
      : !u.completed && !!u.started) && matchesTag(u.tags) && matchesQuery(u.title, u.tags)
    ),
    sortUniverses, u => u.title, u => u.createdAt ?? '', u => u.lastActivityAt ?? u.createdAt ?? '', randomSeed
  )
  const visibleCharacters = sortByOption(
    characters.filter(c =>
      (view === 'favorites' ? isFav('character', c.id)
      : view === 'completed' ? isCharCompleted(c)
      : view === 'waiting' ? !c.started
      : !isCharCompleted(c) && !!c.started) && matchesTag(c.tags) && matchesQuery(c.name, c.tags) && (genderFilter === 'all' || genderBucket(c.gender) === genderFilter)
    ),
    sortCharacters, c => c.name, c => c.createdAt ?? '', undefined, randomSeed
  )

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
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: view === 'active' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => handleView('active')}>진행 중 <span style={{ opacity: 0.55 }}>{counts.active}</span></button>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'waiting' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: view === 'waiting' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => handleView('waiting')}>대기 <span style={{ opacity: 0.55 }}>{counts.waiting}</span></button>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: view === 'completed' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => handleView('completed')}>완결 <span style={{ opacity: 0.55 }}>{counts.completed}</span></button>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'favorites' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: view === 'favorites' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => handleView('favorites')}>★ 즐겨찾기</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: searchOpen ? 'var(--w-accent)' : 'var(--w-surface-2)', color: searchOpen ? '#fff' : 'var(--w-ink-soft)' }} onClick={toggleSearch}>🔍 검색</button>
          <select
            className="field"
            style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
            value={tab === 'universes' ? sortUniverses : sortCharacters}
            onChange={e => tab === 'universes' ? handleSortUniverses(e.target.value as SortOption) : handleSortCharacters(e.target.value as SortOption)}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
          </select>
        </div>
      </div>

      {searchOpen && (
        <>
          <div style={{ padding: '0 16px 8px' }}>
            <input
              className="field"
              style={{ fontSize: 12, width: '100%' }}
              placeholder={tab === 'universes' ? '제목으로 검색' : '이름으로 검색'}
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {genderBuckets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>성별</span>
              <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === 'all' ? 'var(--w-accent)' : 'var(--w-surface-2)', color: genderFilter === 'all' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => setGenderFilter('all')}>전체</button>
              {genderBuckets.map(g => (
                <button key={g.key} className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === g.key ? 'var(--w-accent)' : 'var(--w-surface-2)', color: genderFilter === g.key ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => setGenderFilter(g.key)}>{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} chipClass="whif-chip" accentVar="--w-accent" counts={tCounts} />
        </>
      )}

      <div className="whif-scroll" ref={scrollRef}>
        {loading ? (
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
        ) : tab === 'universes' ? (
          visibleUniverses.length === 0 ? (
            selectedTags.length > 0 || query.trim()
              ? <div className="whif-empty">검색 결과가 없습니다.</div>
            : view === 'favorites'
              ? <div className="whif-empty">즐겨찾기한 작품이 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
            : view === 'completed'
              ? <div className="whif-empty">완결한 작품이 없습니다.</div>
              : view === 'waiting'
                ? <div className="whif-empty">대기 중인 작품이 없습니다.</div>
                : universes.length === 0
                  ? <div className="whif-empty">가져온 작품이 없습니다<br />⋮ 메뉴에서 WHIF URL로 가져오세요.</div>
                  : <div className="whif-empty">진행 중인 작품이 없습니다.</div>
          ) : (
            <div className="whif-grid">
              {visibleUniverses.slice(0, count).map(u => {
                const thumb = u.coverImageUrl || u.characters[0]?.avatarUrl || ''
                return (
                  <div key={u.id} className="whif-card" style={{ position: 'relative' }}
                    onClick={() => !editMode && router.push(`/whif/universes/${u.id}`)}>
                    {u.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                    {thumb ? <img className="whif-card-img" loading="lazy" decoding="async" src={thumb} alt="" />
                      : <div className="whif-card-img" />}
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
              })}
            </div>
          )
        ) : (
          visibleCharacters.length === 0 ? (
            selectedTags.length > 0 || query.trim()
              ? <div className="whif-empty">검색 결과가 없습니다.</div>
            : view === 'favorites'
              ? <div className="whif-empty">즐겨찾기한 캐릭터가 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
            : view === 'completed'
              ? <div className="whif-empty">완결한 캐릭터가 없습니다.</div>
              : view === 'waiting'
                ? <div className="whif-empty">대기 중인 캐릭터가 없습니다.</div>
                : characters.length === 0
                  ? <div className="whif-empty">가져온 캐릭터가 없습니다.</div>
                  : <div className="whif-empty">진행 중인 캐릭터가 없습니다.</div>
          ) : (
            <div className="whif-grid">
              {visibleCharacters.slice(0, count).map(c => (
                <div key={c.id} className="whif-card" style={{ position: 'relative' }}
                  onClick={() => !editMode && router.push(`/whif/characters/${c.id}`)}>
                  {c.hasArchived && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                  {c.avatarUrl ? <img className="whif-card-img" loading="lazy" decoding="async" src={c.avatarUrl} alt="" />
                    : <div className="whif-card-img" />}
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
              ))}
            </div>
          )
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </>
  )
}
