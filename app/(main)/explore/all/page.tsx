'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { SortOption } from '@/lib/listSort'
import { useFavorites } from '@/lib/useFavorites'
import { useInfiniteScroll } from '@/lib/useInfiniteScroll'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { useDisplayName } from '@/lib/useDisplayName'
import TagFilterBar from '@/components/ui/TagFilterBar'
import { buildTagGroups, type CenterTagConfig } from '@/lib/tagGroups'
import type { GenderBucket } from '@/lib/cardGender'

interface Col {
  id: string
  title: string
  coverImageUrl: string
  description?: string
  tags: string[]
  sourceUrl: string
  completed?: boolean
  started?: boolean
  createdAt?: string
  lastActivityAt?: string
  characters: { id: string; name: string; avatarUrl: string | null; gender?: string | null }[]
}

type ViewTab = 'active' | 'waiting' | 'completed' | 'favorites'

const CENTERS: { key: string; label: string; match: (url: string) => boolean; color: string; detail: (id: string) => string }[] = [
  { key: 'whif',       label: 'WHIF',       match: u => u.includes('whif.'),        color: '#8b5cf6', detail: id => `/whif/characters/${id}` },
  { key: 'zeta',       label: 'ZETA',       match: u => u.includes('zeta-ai.io'),   color: '#7c5cff', detail: id => `/zeta/plots/${id}` },
  { key: 'melting',    label: 'melting',    match: u => u.includes('melting.chat'), color: '#ff2e93', detail: id => `/melting/characters/${id}` },
  { key: 'tikita',     label: 'tikita',     match: u => u.includes('tikita.ai'),    color: '#16b8a6', detail: id => `/tikita/story/${id}` },
  { key: 'chub',       label: 'chub',       match: u => u.includes('chub.ai'),      color: '#ff6a3d', detail: id => `/chub/characters/${id}` },
  { key: 'rofan',      label: 'rofanai',    match: u => u.includes('rofan.ai'),     color: '#e0529c', detail: id => `/rofan/characters/${id}` },
  { key: 'loveydovey', label: 'loveydovey', match: u => u.includes('loveydovey.ai'),color: '#ff5a5f', detail: id => `/loveydovey/characters/${id}` },
  { key: 'babechat',   label: 'babechat',   match: u => u.includes('babechat.'),    color: '#5b8cff', detail: id => `/babechat/characters/${id}` },
  { key: 'tingle',     label: 'tingle',     match: u => u.includes('tingle.chat'),  color: '#ff5776', detail: id => `/tingle/characters/${id}` },
  { key: 'crack',      label: '크랙',       match: u => u.includes('crack.wrtn.ai'),color: '#3a3a3f', detail: id => `/crack/stories/${id}` },
]

function detectCenter(sourceUrl: string) {
  return CENTERS.find(c => c.match(sourceUrl)) ?? { key: 'other', label: '기타', color: '#888', detail: (id: string) => `/characters/${id}` }
}

function getTingleDetailPath(colId: string, sourceUrl: string) {
  if (sourceUrl.includes('/universes/')) return `/tingle/universes/${colId}`
  if (sourceUrl.includes('/scenes/')) return `/tingle/scenes/${colId}`
  return `/tingle/characters/${colId}`
}
// (colId는 항상 DB UUID — tingle 원본 숫자 ID와 혼동 금지)

function isWorldType(col: Col): boolean {
  const url = col.sourceUrl
  if (url.includes('whif.') || url.includes('tikita.ai')) return true
  return col.characters.length > 1
}

export default function AllCentersPage() {
  const router = useRouter()
  const [items, setItems] = useState<Col[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [facets, setFacets] = useState<{ counts: Record<string, number>; genders: { key: GenderBucket; label: string; count: number }[]; tags: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewTab>('active')
  const [sort, setSort] = useState<SortOption>('latest')
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedCenters, setSelectedCenters] = useState<string[]>([])
  const [genderFilter, setGenderFilter] = useState<GenderBucket | 'all'>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)
  const { isFav, toggleFav } = useFavorites()
  const scrollRef = useRef<HTMLDivElement>(null)
  const userName = useDisplayName()
  const offsetRef = useRef(0)
  const genRef = useRef(0)      // 필터 변경마다 증가 — 진행 중이던 스크롤 응답의 stale append 방지
  const loadingMoreRef = useRef(false)
  const LIMIT = 30

  const buildParams = useCallback((offset: number, withFacets: boolean) => {
    const p = new URLSearchParams()
    p.set('view', view); p.set('sort', sort); p.set('seed', String(randomSeed))
    if (debouncedQuery.trim()) p.set('q', debouncedQuery.trim())
    if (selectedCenters.length) p.set('centers', selectedCenters.join(','))
    if (genderFilter !== 'all') p.set('gender', genderFilter)
    if (selectedTags.length) p.set('tags', selectedTags.join(','))
    p.set('limit', String(LIMIT)); p.set('offset', String(offset))
    if (withFacets) p.set('facets', '1')
    return p.toString()
  }, [view, sort, randomSeed, debouncedQuery, selectedCenters, genderFilter, selectedTags])

  // 검색어 디바운스(300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => { api.get('/api/center-tags').then(setTagConfig).catch(() => {}) }, [])
  useEffect(() => {
    const saved = { view: sessionStorage.getItem('all_view'), sort: localStorage.getItem('all_sort') }
    if (saved.view) setView(saved.view as ViewTab)
    if (saved.sort) setSort(saved.sort as SortOption)
  }, [])

  // 필터/정렬/검색이 바뀌면 offset=0으로 재조회(패싯 포함)
  useEffect(() => {
    const gen = ++genRef.current
    setLoading(true); offsetRef.current = 0
    api.get(`/api/collections/browse?${buildParams(0, true)}`)
      .then((r: any) => {
        if (gen !== genRef.current) return
        setItems(r.items ?? [])
        setTotal(r.total ?? 0)
        setHasMore(!!r.hasMore)
        if (r.facets) setFacets(r.facets)
        offsetRef.current = (r.items?.length ?? 0)
      })
      .catch(() => {})
      .finally(() => { if (gen === genRef.current) setLoading(false) })
  }, [buildParams])

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    const gen = genRef.current
    api.get(`/api/collections/browse?${buildParams(offsetRef.current, false)}`)
      .then((r: any) => {
        if (gen !== genRef.current) return
        setItems(prev => [...prev, ...(r.items ?? [])])
        setHasMore(!!r.hasMore)
        offsetRef.current += (r.items?.length ?? 0)
      })
      .catch(() => {})
      .finally(() => { loadingMoreRef.current = false })
  }, [hasMore, buildParams])

  const { sentinelRef } = useInfiniteScroll([], scrollRef, LIMIT, loadMore)

  const handleView = (v: ViewTab) => { setView(v); sessionStorage.setItem('all_view', v) }
  const handleSort = (v: SortOption) => {
    setSort(v); localStorage.setItem('all_sort', v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }
  const toggleCenter = (key: string) =>
    setSelectedCenters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const toggleTag = (tag: string) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  const toggleSearch = () => setSearchOpen(o => { if (o) { setQuery(''); setSelectedCenters([]); setGenderFilter('all'); setSelectedTags([]) } return !o })

  // 패싯(서버 계산) 파생값
  const counts = { active: facets?.counts.active ?? 0, waiting: facets?.counts.waiting ?? 0, completed: facets?.counts.completed ?? 0 }
  const genderBuckets = facets?.genders ?? []
  const tCounts = facets?.tags ?? {}
  const tagGroups = buildTagGroups(Object.keys(tCounts), tagConfig)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
        <button style={{ appearance: 'none', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, padding: 0 }} onClick={() => router.push('/explore')}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 800 }}>전체 센터</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            style={{ appearance: 'none', border: 'none', background: searchOpen ? 'var(--accent)' : 'var(--pane)', color: searchOpen ? '#fff' : 'var(--ink)', borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
            onClick={toggleSearch}
          >🔍 검색</button>
          <select className="field" style={{ fontSize: 11, padding: '3px 6px', width: 'auto' }} value={sort} onChange={e => handleSort(e.target.value as SortOption)}>
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto' }}>
        {(['active', 'waiting', 'completed', 'favorites'] as ViewTab[]).map(v => (
          <button key={v}
            onClick={() => handleView(v)}
            style={{
              appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999, whiteSpace: 'nowrap',
              padding: '4px 12px', fontSize: 12, fontWeight: 600,
              background: view === v ? 'var(--accent)' : 'var(--pane)',
              color: view === v ? '#fff' : 'var(--ink-soft)',
              outline: view === v ? 'none' : '1px solid var(--hairline)',
            }}
          >
            {v === 'active' ? `진행 중 ${counts.active}` : v === 'waiting' ? `대기 ${counts.waiting}` : v === 'completed' ? `완결 ${counts.completed}` : '★ 즐겨찾기'}
          </button>
        ))}
      </div>

      {searchOpen && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="field"
            style={{ fontSize: 12 }}
            placeholder="이름·태그로 검색"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CENTERS.map(c => (
              <button key={c.key}
                onClick={() => toggleCenter(c.key)}
                style={{
                  appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999,
                  padding: '3px 10px', fontSize: 11, fontWeight: 700,
                  background: selectedCenters.includes(c.key) ? c.color : 'var(--pane)',
                  color: selectedCenters.includes(c.key) ? '#fff' : 'var(--ink-soft)',
                  outline: selectedCenters.includes(c.key) ? 'none' : '1px solid var(--hairline)',
                }}
              >{c.label}</button>
            ))}
          </div>
          {/* 성별 필터 */}
          {genderBuckets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setGenderFilter('all')}
                style={{
                  appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999,
                  padding: '3px 10px', fontSize: 11, fontWeight: 600,
                  background: genderFilter === 'all' ? 'var(--accent)' : 'var(--pane)',
                  color: genderFilter === 'all' ? '#fff' : 'var(--ink-soft)',
                  outline: genderFilter === 'all' ? 'none' : '1px solid var(--hairline)',
                }}
              >전체</button>
              {genderBuckets.map(g => (
                <button key={g.key}
                  onClick={() => setGenderFilter(g.key)}
                  style={{
                    appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999,
                    padding: '3px 10px', fontSize: 11, fontWeight: 600,
                    background: genderFilter === g.key ? 'var(--accent)' : 'var(--pane)',
                    color: genderFilter === g.key ? '#fff' : 'var(--ink-soft)',
                    outline: genderFilter === g.key ? 'none' : '1px solid var(--hairline)',
                  }}
                >{g.label} <span style={{ opacity: 0.55 }}>{g.count}</span></button>
              ))}
            </div>
          )}
          {/* 태그 필터 */}
          <TagFilterBar
            groups={tagGroups}
            selected={selectedTags}
            onToggle={toggleTag}
            onClear={() => setSelectedTags([])}
            chipClass="chip"
            accentVar="--accent"
            counts={tCounts}
            storageKey="all_tagcollapse"
          />
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, paddingTop: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
            {query || selectedCenters.length > 0 || genderFilter !== 'all' || selectedTags.length > 0 ? '검색 결과가 없습니다.' : view === 'favorites' ? '즐겨찾기한 항목이 없습니다.' : view === 'completed' ? '완결한 항목이 없습니다.' : view === 'waiting' ? '대기 중인 항목이 없습니다.' : '진행 중인 항목이 없습니다.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, paddingTop: 10 }}>
            {items.map(col => {
              const center = detectCenter(col.sourceUrl)
              const world = isWorldType(col)
              const thumb = col.coverImageUrl || col.characters[0]?.avatarUrl || ''
              const charNames = col.characters.map(c => c.name)
              const desc = col.description?.trim()
                ? replaceDisplayPlaceholders(col.description, userName, charNames)
                : ''
              const detailPath = center.key === 'tingle'
                ? getTingleDetailPath(col.id, col.sourceUrl)
                : center.detail(col.id)
              return (
                <div key={col.id}
                  onClick={() => router.push(detailPath)}
                  style={{
                    position: 'relative', cursor: 'pointer', borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden', background: 'var(--pane)', border: '1px solid var(--hairline)',
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* 썸네일 */}
                  <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', background: 'var(--chrome-face)' }}>
                    {thumb
                      ? <img src={thumb} loading="lazy" decoding="async" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 32 }}>🎭</div>
                    }
                    {/* 완결 뱃지 */}
                    {col.completed && (
                      <div style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 700, background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>완결</div>
                    )}
                    {/* 즐겨찾기 버튼 */}
                    <button
                      onClick={e => { e.stopPropagation(); toggleFav('collection', col.id) }}
                      aria-label="즐겨찾기"
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', color: isFav('collection', col.id) ? '#ffd24a' : '#fff', borderRadius: 999, width: 26, height: 26, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >{isFav('collection', col.id) ? '★' : '☆'}</button>
                  </div>
                  {/* 카드 바디 */}
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</div>
                    {desc && (
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>{desc}</div>
                    )}
                    {/* 센터 + 세계관/캐릭터 뱃지 */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: center.color, color: '#fff' }}>{center.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--chrome-face)', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}>{world ? '세계관' : '캐릭터'}</span>
                      {col.tags?.slice(0, 1).map(t => (
                        <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: 'var(--chrome-face)', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}>#{t}</span>
                      ))}
                    </div>
                  </div>
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
