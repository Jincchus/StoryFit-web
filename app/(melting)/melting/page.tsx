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
import type { LikedCharacter } from '@/app/api/melting/liked-scan/route'

interface MChar {
  id: string; title: string; coverImageUrl: string; tags: string[]; description?: string
  sourceUrl: string
  characters: { id: string; name: string; avatarUrl: string | null; gender?: string | null }[]
  completed?: boolean
  started?: boolean
  createdAt?: string
  lastActivityAt?: string
}

export default function MeltingListPage() {
  const router = useRouter()
  const [chars, setChars] = useState<MChar[]>([])
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
  const [likedPanel, setLikedPanel] = useState(false)
  const [likedList, setLikedList] = useState<LikedCharacter[]>([])
  const [likedSelected, setLikedSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const [genderFilter, setGenderFilter] = useState<string>('all')
  const toggleSearch = () => setSearchOpen(o => { if (o) { setQuery(''); setSelectedTags([]); setGenderFilter('all') } return !o })

  useEffect(() => {
    setEditMode(localStorage.getItem('melting_edit') === '1')
    setSort((localStorage.getItem('melting_sort') as SortOption) || 'latest')
    setView((sessionStorage.getItem('melting_view') as typeof view) || 'active')
    fetchData()
    api.get('/api/center-tags').then(setTagConfig).catch(() => {})
  }, [])

  const handleSort = (v: SortOption) => {
    setSort(v); localStorage.setItem('melting_sort', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }

  const handleView = (v: typeof view) => {
    setView(v); sessionStorage.setItem('melting_view', v)
  }

  const FETCH_SIZE = 60

  const fetchData = async () => {
    setLoading(true)
    setHasMore(false)
    try {
      const data: MChar[] = await api.get(`/api/collections?isMelting=true&limit=${FETCH_SIZE}`)
      setChars(data)
      setHasMore(data.length === FETCH_SIZE)
    } finally { setLoading(false) }
  }

  const loadMore = async () => {
    if (fetchingMore || !hasMore) return
    setFetchingMore(true)
    try {
      const data: MChar[] = await api.get(`/api/collections?isMelting=true&limit=${FETCH_SIZE}&offset=${chars.length}`)
      setChars(prev => [...prev, ...data])
      setHasMore(data.length === FETCH_SIZE)
    } catch {} finally { setFetchingMore(false) }
  }

  const scrollRef = useScrollRestore(`melting_scroll_${view}`, !loading)
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

  const handleLikedScan = async () => {
    setMenuOpen(false)
    setLikedPanel(true)
    if (likedList.length > 0) return
    setScanning(true); setScanMsg('멜팅 좋아요 목록 스캔 중...')
    try {
      const res = await api.get('/api/melting/liked-scan')
      const list: LikedCharacter[] = res.liked ?? []
      setLikedList(list)
      setScanMsg(`♥ ${list.length}개 발견`)
    } catch (e: any) {
      setScanMsg(`⚠ ${e.message ?? '스캔 실패'}`)
    } finally {
      setScanning(false)
    }
  }

  const toggleLikedSelect = (id: string) => {
    setLikedSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleLikedImport = async () => {
    const targets = likedList.filter(x => likedSelected.has(x.id))
    if (targets.length === 0 || importing) return
    setImporting(true); setMsg('')
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < targets.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${targets.length})`)
      try {
        await api.post('/api/characters/import', { url: targets[i].sourceUrl })
        ok++
      } catch {
        failed.push(targets[i].name)
      }
    }
    setImporting(false)
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.join(', ')} 실패` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) {
      setLikedPanel(false)
      setLikedSelected(new Set())
    }
    await fetchData()
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('melting_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const createCharacter = async () => {
    const title = prompt('새 캐릭터 이름'); if (!title?.trim()) return
    await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://melting.chat/local/${Date.now()}` })
    setMenuOpen(false); await fetchData()
  }

  const deleteChar = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  const matchesTag = (tags: string[]) => selectedTags.length === 0 || selectedTags.every(t => tags.includes(t))
  const matchesQuery = (title: string, tags: string[] = []) => { const q = query.trim().toLowerCase(); return !q || title.toLowerCase().includes(q) || tags.some(t => t.toLowerCase().includes(q)) }
  const toggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  const counts = viewCounts(chars)
  const genderBuckets = availableGenderBuckets(chars)
  const matchesGender = (c: MChar) => genderFilter === 'all' || cardGenderBucket(c.characters) === genderFilter
  const viewMatch = (c: MChar) => view === 'favorites' ? isFav('collection', c.id)
    : view === 'completed' ? c.completed
    : view === 'waiting' ? !c.started
    : !c.completed && !!c.started
  // 태그 목록·카운트는 뷰+성별+검색 적용 base 기준(태그 제외) — 진행중 탭이면 진행중 카드 태그만.
  const tagBase = chars.filter(c => viewMatch(c) && matchesGender(c) && matchesQuery(c.title, c.tags))
  const tagGroups = buildTagGroups(tagBase.flatMap(c => c.tags ?? []), tagConfig)
  const tCounts = tagCounts(tagBase)
  const visibleChars = sortByOption(
    tagBase.filter(c => matchesTag(c.tags)),
    sort, c => c.title, c => c.createdAt ?? '', c => c.lastActivityAt ?? c.createdAt ?? '', randomSeed
  )

  return (
    <>
      {/* 좋아요 목록 패널 */}
      {likedPanel && (() => {
        const importable = likedList.filter(x => !chars.some(c => c.sourceUrl === x.sourceUrl))
        const allSelected = importable.length > 0 && importable.every(x => likedSelected.has(x.id))
        const toggleAll = () => {
          if (allSelected) setLikedSelected(new Set())
          else setLikedSelected(new Set(importable.map(x => x.id)))
        }
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={() => setLikedPanel(false)}>
            <div style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--m-bg)', borderRadius: '16px 16px 0 0' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--m-ink)' }}>♥ 멜팅 좋아요 목록</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => { setLikedList([]); setLikedSelected(new Set()); setScanMsg(''); handleLikedScan() }}
                    style={{ appearance: 'none', border: '1px solid var(--m-line)', background: 'var(--m-surface)', color: 'var(--m-ink-soft)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                    새로고침
                  </button>
                  <button onClick={() => setLikedPanel(false)}
                    style={{ appearance: 'none', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--m-ink-soft)' }}>✕</button>
                </div>
              </div>
              {scanMsg && (
                <div style={{ padding: '0 16px 6px', fontSize: 11, color: scanMsg.startsWith('⚠') ? '#ff6b8a' : 'var(--m-ink-soft)', flexShrink: 0 }}>{scanMsg}</div>
              )}
              {!scanning && importable.length > 0 && (
                <div style={{ padding: '0 16px 6px', flexShrink: 0 }}>
                  <button onClick={toggleAll}
                    style={{ appearance: 'none', border: '1px solid var(--m-line)', background: 'var(--m-surface)', color: 'var(--m-ink-soft)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                    {allSelected ? '전체 해제' : `전체 선택 (${importable.length}개)`}
                  </button>
                </div>
              )}
              <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
                {scanning ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--m-ink-soft)', fontSize: 13 }}>스캔 중...</div>
                ) : likedList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--m-ink-soft)', fontSize: 13 }}>좋아요한 캐릭터가 없습니다.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {likedList.map(item => {
                      const alreadyImported = chars.some(c => c.sourceUrl === item.sourceUrl)
                      const checked = likedSelected.has(item.id)
                      return (
                        <div key={item.id}
                          onClick={() => !alreadyImported && toggleLikedSelect(item.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--m-line)', cursor: alreadyImported ? 'default' : 'pointer', opacity: alreadyImported ? 0.5 : 1 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? 'var(--m-accent)' : 'var(--m-line)'}`, background: checked ? 'var(--m-accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                            {checked && <span style={{ fontSize: 12, color: '#fff', lineHeight: 1 }}>✓</span>}
                          </div>
                          {item.coverImageUrl
                            ? <img src={item.coverImageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--m-surface)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>🎭</div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--m-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                              {item.isAdult && <span style={{ fontSize: 9, fontWeight: 700, background: '#ff5776', color: '#fff', padding: '1px 4px', borderRadius: 3 }}>성인</span>}
                              {item.tags.slice(0, 2).map(t => (
                                <span key={t} style={{ fontSize: 9, color: 'var(--m-ink-soft)', background: 'var(--m-surface)', padding: '1px 5px', borderRadius: 10 }}>#{t}</span>
                              ))}
                            </div>
                          </div>
                          {alreadyImported && <span style={{ fontSize: 11, color: '#4ade80', flexShrink: 0 }}>✓ 완료</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {!scanning && likedSelected.size > 0 && (
                <div style={{ padding: '10px 16px 20px', flexShrink: 0, borderTop: '1px solid var(--m-line)' }}>
                  <button
                    disabled={importing}
                    onClick={handleLikedImport}
                    style={{ width: '100%', appearance: 'none', border: 'none', background: 'var(--m-accent)', color: '#fff', borderRadius: 10, padding: '13px 0', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>
                    {importing ? msg || '가져오는 중...' : `📥 선택한 ${likedSelected.size}개 가져오기`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <div className="melting-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="melting-iconbtn" aria-label="홈으로" onClick={() => router.push('/')}>🏠</button>
          <div className="melting-logo">melting</div>
        </div>
        <button className="melting-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="melting-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea className="field" placeholder="URL을 한 줄에 하나씩 붙여넣기 (여러 개 가능)" value={importUrl} onChange={e => setImportUrl(e.target.value)} rows={3} style={{ fontSize: 12, resize: 'vertical' }} />
              <button className="melting-menu-item"
                style={{ background: 'var(--m-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="melting-menu-item" onClick={handleLikedScan}>♥ 좋아요 목록</button>
            <button className="melting-menu-item" onClick={createCharacter}>+ 새 캐릭터 만들기</button>
            <button className="melting-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'active' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('active')}>진행 중 <span style={{ opacity: 0.55 }}>{counts.active}</span></button>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'waiting' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'waiting' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('waiting')}>대기 <span style={{ opacity: 0.55 }}>{counts.waiting}</span></button>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'completed' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('completed')}>완결 <span style={{ opacity: 0.55 }}>{counts.completed}</span></button>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'favorites' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'favorites' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => handleView('favorites')}>★ 즐겨찾기</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: searchOpen ? 'var(--m-accent)' : 'var(--m-surface-2)', color: searchOpen ? '#fff' : 'var(--m-ink-soft)' }} onClick={toggleSearch}>🔍 검색</button>
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
              <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === 'all' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: genderFilter === 'all' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => setGenderFilter('all')}>전체</button>
              {genderBuckets.map(g => (
                <button key={g.key} className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: genderFilter === g.key ? 'var(--m-accent)' : 'var(--m-surface-2)', color: genderFilter === g.key ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => setGenderFilter(g.key)}>{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          <TagFilterBar groups={tagGroups} selected={selectedTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} chipClass="melting-chip" accentVar="--m-accent" counts={tCounts} storageKey="melting_tagcollapse" />
        </>
      )}

      <div className="melting-scroll" ref={scrollRef}>
        {loading ? (
          <div className="melting-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="melting-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 0 }} />
                <div className="melting-card-body">
                  <div className="skeleton skeleton-line medium" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleChars.length === 0 ? (
          selectedTags.length > 0 || query.trim()
            ? <div className="melting-empty">검색 결과가 없습니다.</div>
          : view === 'favorites'
            ? <div className="melting-empty">즐겨찾기한 캐릭터가 없습니다.<br />카드의 ★를 눌러 추가하세요.</div>
          : view === 'completed'
            ? <div className="melting-empty">완결한 캐릭터가 없습니다.</div>
            : view === 'waiting'
              ? <div className="melting-empty">대기 중인 캐릭터가 없습니다.</div>
              : chars.length === 0
                ? <div className="melting-empty">가져온 캐릭터가 없습니다<br />⋮ 메뉴에서 melting.chat 캐릭터 URL로 가져오세요.</div>
                : <div className="melting-empty">진행 중인 캐릭터가 없습니다.</div>
        ) : (
          <div className="melting-grid">
            {visibleChars.slice(0, count).map(c => {
              const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
              return (
                <div key={c.id} className="melting-card" style={{ position: 'relative' }}
                  onClick={() => !editMode && router.push(`/melting/characters/${c.id}`)}>
                  {c.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--m-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                  {thumb ? <img className="melting-card-img" loading="lazy" decoding="async" src={thumb} alt="" /> : <div className="melting-card-img" />}
                  <div className="melting-card-body">
                    <div className="melting-card-title">{c.title}</div>
                    {c.description?.trim() && (
                      <div style={{ fontSize: 11, color: 'var(--m-ink-soft)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {replaceDisplayPlaceholders(c.description, '나', c.characters?.[0]?.name ?? '')}
                      </div>
                    )}
                    {c.tags?.length > 0 && (
                      <div className="melting-card-tags">
                        {c.tags.slice(0, 3).map(t => <span key={t} className="melting-chip">#{t}</span>)}
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
