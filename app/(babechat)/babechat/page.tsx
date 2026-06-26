'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { sortByOption, type SortOption } from '@/lib/listSort'
import { useScrollRestore } from '@/lib/useScrollRestore'
import { useInfiniteScroll } from '@/lib/useInfiniteScroll'
import TagFilterBar from '@/components/ui/TagFilterBar'
import { buildTagGroups, type CenterTagConfig } from '@/lib/tagGroups'
import { cardGenderBucket, availableGenderBuckets } from '@/lib/cardGender'
import { useFavorites } from '@/lib/useFavorites'
import { viewCounts, tagCounts } from '@/lib/centerCounts'
import { replaceDisplayPlaceholders } from '@/lib/josa'

interface BChar {
  id: string; title: string; coverImageUrl: string; tags: string[]; description?: string
  characters: { id: string; name: string; avatarUrl: string | null; gender?: string | null }[]
  completed?: boolean
  started?: boolean
  createdAt?: string
  lastActivityAt?: string
}

export default function BabechatListPage() {
  const router = useRouter()
  const [chars, setChars] = useState<BChar[]>([])
  const [view, setView] = useState<'active' | 'waiting' | 'completed' | 'favorites'>('active')
  const { isFav, toggleFav } = useFavorites()
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [sort, setSort] = useState<SortOption>('latest')
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)
  const [genderFilter, setGenderFilter] = useState<string>('all')
  const toggleSearch = () => setSearchOpen(o => { if (o) { setQuery(''); setSelectedTags([]); setGenderFilter('all') } return !o })

  useEffect(() => {
    setEditMode(localStorage.getItem('bc_edit') === '1')
    setSort((localStorage.getItem('bc_sort') as SortOption) || 'latest')
    setView((sessionStorage.getItem('bc_view') as typeof view) || 'active')
    fetchData()
    api.get('/api/center-tags').then(setTagConfig).catch(() => {})
  }, [])

  const handleSort = (v: SortOption) => {
    setSort(v); localStorage.setItem('bc_sort', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }

  const handleView = (v: typeof view) => {
    setView(v); sessionStorage.setItem('bc_view', v)
  }

  const FETCH_SIZE = 60

  const fetchData = async () => {
    setLoading(true)
    setHasMore(false)
    try {
      const data: BChar[] = await api.get(`/api/collections?isBabechat=true&limit=${FETCH_SIZE}`)
      setChars(data)
      setHasMore(data.length === FETCH_SIZE)
    } finally { setLoading(false) }
  }

  const loadMore = async () => {
    if (fetchingMore || !hasMore) return
    setFetchingMore(true)
    try {
      const data: BChar[] = await api.get(`/api/collections?isBabechat=true&limit=${FETCH_SIZE}&offset=${chars.length}`)
      setChars(prev => [...prev, ...data])
      setHasMore(data.length === FETCH_SIZE)
    } catch {} finally { setFetchingMore(false) }
  }

  const scrollRef = useScrollRestore(`bc_scroll_${view}`, !loading)
  const { count, sentinelRef } = useInfiniteScroll([view, sort, query, selectedTags, genderFilter, randomSeed], scrollRef, 30, loadMore)

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
    localStorage.setItem('bc_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const createCharacter = async () => {
    const title = prompt('새 캐릭터 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://babechat.ai/local/${Date.now()}` })
    setMenuOpen(false); await fetchData()
  }

  const deleteChar = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  const matchesTag = (tags: string[]) => selectedTags.length === 0 || selectedTags.every(t => tags.includes(t))
  const matchesQuery = (title: string, tags: string[] = []) => { const q = query.trim().toLowerCase(); return !q || title.toLowerCase().includes(q) || tags.some(t => t.toLowerCase().includes(q)) }
  const toggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  const tagGroups = buildTagGroups(chars.flatMap(c => c.tags ?? []), tagConfig)
  const counts = viewCounts(chars)
  const tCounts = tagCounts(chars)
  const genderBuckets = availableGenderBuckets(chars)
  const visibleChars = sortByOption(
    chars.filter(c =>
      (view === 'favorites' ? isFav('collection', c.id)
      : view === 'completed' ? c.completed
      : view === 'waiting' ? !c.started
      : !c.completed && !!c.started) && matchesTag(c.tags) && matchesQuery(c.title, c.tags) && (genderFilter === 'all' || cardGenderBucket(c.characters) === genderFilter)
    ),
    sort, c => c.title, c => c.createdAt ?? '', c => c.lastActivityAt ?? c.createdAt ?? '', randomSeed
  )

  return (
    <>
      <div className="bc-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="bc-iconbtn" aria-label="홈으로" onClick={() => router.push('/')}>🏠</button>
          <div className="bc-logo">babechat</div>
        </div>
        <button className="bc-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="bc-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea className="field" placeholder="URL을 한 줄에 하나씩 붙여넣기 (여러 개 가능)" value={importUrl} onChange={e => setImportUrl(e.target.value)} rows={3} style={{ fontSize: 12, resize: 'vertical' }} />
              <button className="bc-menu-item"
                style={{ background: 'var(--b-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="bc-menu-item" onClick={createCharacter}>+ 새 캐릭터 만들기</button>
            <button className="bc-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="bc-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--b-accent)' : 'var(--b-surface-2)', color: view === 'active' ? '#fff' : 'var(--b-ink-soft)' }} onClick={() => handleView('active')}>진행 중 <span style={{ opacity: 0.55 }}>{counts.active}</span></button>
          <button className="bc-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'waiting' ? 'var(--b-accent)' : 'var(--b-surface-2)', color: view === 'waiting' ? '#fff' : 'var(--b-ink-soft)' }} onClick={() => handleView('waiting')}>대기 <span style={{ opacity: 0.55 }}>{counts.waiting}</span></button>
          <button className="bc-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--b-accent)' : 'var(--b-surface-2)', color: view === 'completed' ? '#fff' : 'var(--b-ink-soft)' }} onClick={() => handleView('completed')}>완결 <span style={{ opacity: 0.55 }}>{counts.completed}</span></button>
          <button className="bc-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'favorites' ? 'var(--b-accent)' : 'var(--b-surface-2)', color: view === 'favorites' ? '#fff' : 'var(--b-ink-soft)' }} onClick={() => handleView('favorites')}>★ 즐겨찾기</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="bc-chip" style={{ cursor: 'pointer', border: 'none', background: searchOpen ? 'var(--b-accent)' : 'var(--b-surface-2)', color: searchOpen ? '#fff' : 'var(--b-ink-soft)' }} onClick={toggleSearch}>🔍 검색</button>
          <select
            className="field"
            style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }}
            value={sort}
            onChange={e => handleSort(e.target.value as SortOption)}
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
              placeholder="이름으로 검색"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {genderBuckets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 8px', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>성별</span>
              <button className="bc-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === 'all' ? 'var(--b-accent)' : 'var(--b-surface-2)', color: genderFilter === 'all' ? '#fff' : 'var(--b-ink-soft)' }} onClick={() => setGenderFilter('all')}>전체</button>
              {genderBuckets.map(g => (
                <button key={g.key} className="bc-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === g.key ? 'var(--b-accent)' : 'var(--b-surface-2)', color: genderFilter === g.key ? '#fff' : 'var(--b-ink-soft)' }} onClick={() => setGenderFilter(g.key)}>{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} chipClass="bc-chip" accentVar="--b-accent" counts={tCounts} />
        </>
      )}

      <div className="bc-scroll" ref={scrollRef}>
        {loading ? (
          <div className="bc-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bc-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 0 }} />
                <div className="bc-card-body">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleChars.length === 0 ? (
          selectedTags.length > 0 || query.trim()
            ? <div className="bc-empty">검색 결과가 없습니다.</div>
          : view === 'favorites'
            ? <div className="bc-empty">즐겨찾기한 캐릭터가 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
          : view === 'completed'
            ? <div className="bc-empty">완결한 캐릭터가 없습니다.</div>
            : view === 'waiting'
              ? <div className="bc-empty">대기 중인 캐릭터가 없습니다.</div>
              : chars.length === 0
                ? <div className="bc-empty">가져온 캐릭터가 없습니다<br />⋮ 메뉴에서 babechat.ai 캐릭터 URL로 가져오세요.<br />(가져오기 인증 토큰 설정 필요)</div>
                : <div className="bc-empty">진행 중인 캐릭터가 없습니다.</div>
        ) : (
          <div className="bc-grid">
            {visibleChars.slice(0, count).map(c => {
              const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
              return (
                <div key={c.id} className="bc-card" style={{ position: 'relative' }}
                  onClick={() => !editMode && router.push(`/babechat/characters/${c.id}`)}>
                  {c.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--b-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                  {thumb ? <img className="bc-card-img" src={thumb} alt="" /> : <div className="bc-card-img" />}
                  <div className="bc-card-body">
                    <div className="bc-card-title">{c.title}</div>
                    {c.description?.trim() && (
                      <div style={{ fontSize: 11, color: 'var(--b-ink-soft)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {replaceDisplayPlaceholders(c.description, '나', c.characters?.[0]?.name ?? '')}
                      </div>
                    )}
                    {c.tags?.length > 0 && (
                      <div className="bc-card-tags">
                        {c.tags.slice(0, 3).map(t => <span key={t} className="bc-chip">#{t}</span>)}
                      </div>
                    )}
                  </div>
                  {editMode ? (
                    <button onClick={e => { e.stopPropagation(); deleteChar(c.id) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                        border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); toggleFav('collection', c.id) }}
                      aria-label="즐겨찾기"
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)',
                        border: 'none', color: isFav('collection', c.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isFav('collection', c.id) ? '★' : '☆'}</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </>
  )
}
