'use client'
// 센터별 리스트 서버 페이지네이션 훅. useCenterList와 반환 인터페이스가 동일해
// 페이지에서 이름만 바꿔 끼우면 된다. 필터/정렬/카운트를 서버(/api/collections/browse)에서
// 수행하고 경량 카드만 페이지 단위로 받아 무한스크롤로 이어붙인다.
// (팅글은 서사/테마 타입 탭이 있어 browse로 못 옮기므로 기존 useCenterList 유지)
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useFavorites } from './useFavorites'
import type { CenterListItem } from './centerListSelect'
import { buildTagGroups, type CenterTagConfig } from './tagGroups'
import type { GenderBucket } from './cardGender'
import type { SortOption } from './listSort'

type View = 'active' | 'waiting' | 'completed' | 'favorites'
type Facets = { counts: Record<string, number>; genders: { key: GenderBucket; label: string; count: number }[]; tags: Record<string, number> }

function deriveCenterKey(indexQuery: string): string {
  const m = indexQuery.match(/is(\w+)=true/)
  return m ? m[1].toLowerCase() : ''
}

const LIMIT = 30

export function useCenterListPaged(opts: { indexQuery: string; storagePrefix: string }) {
  const { indexQuery, storagePrefix } = opts
  const centerKey = deriveCenterKey(indexQuery)

  const { isFav, toggleFav } = useFavorites()
  const [items, setItems] = useState<CenterListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const [view, setViewState] = useState<View>('active')
  const [sort, setSortState] = useState<SortOption>('latest')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [genderFilter, setGenderFilter] = useState('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1e9))

  const scrollRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const genRef = useRef(0)
  const loadingMoreRef = useRef(false)

  // 초기 상태 복원
  useEffect(() => {
    setViewState((sessionStorage.getItem(`${storagePrefix}_view`) as View) || 'active')
    setSortState((localStorage.getItem(`${storagePrefix}_sort`) as SortOption) || 'latest')
    try {
      const raw = sessionStorage.getItem(`${storagePrefix}_filter`)
      if (raw) {
        const f = JSON.parse(raw)
        if (typeof f.query === 'string') setQuery(f.query)
        if (Array.isArray(f.selectedTags)) setSelectedTags(f.selectedTags)
        if (typeof f.genderFilter === 'string') setGenderFilter(f.genderFilter)
        if (typeof f.searchOpen === 'boolean') setSearchOpen(f.searchOpen)
        if (typeof f.randomSeed === 'number') setRandomSeed(f.randomSeed)
      }
    } catch {}
    api.get('/api/center-tags').then(setTagConfig).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildParams = useCallback((offset: number, withFacets: boolean) => {
    const p = new URLSearchParams()
    p.set('center', centerKey)
    p.set('view', view); p.set('sort', sort); p.set('seed', String(randomSeed))
    if (query.trim()) p.set('q', query.trim())
    if (genderFilter !== 'all') p.set('gender', genderFilter)
    if (selectedTags.length) p.set('tags', selectedTags.join(','))
    p.set('limit', String(LIMIT)); p.set('offset', String(offset))
    if (withFacets) p.set('facets', '1')
    return p.toString()
  }, [centerKey, view, sort, randomSeed, query, genderFilter, selectedTags])

  // 필터 변경 → offset=0 재조회(패싯 포함)
  const reload = useCallback(() => {
    const gen = ++genRef.current
    setLoading(true); offsetRef.current = 0
    api.get(`/api/collections/browse?${buildParams(0, true)}`)
      .then((r: any) => {
        if (gen !== genRef.current) return
        setItems(r.items ?? []); setHasMore(!!r.hasMore)
        if (r.facets) setFacets(r.facets)
        offsetRef.current = r.items?.length ?? 0
        setError(null)
      })
      .catch(() => setError('목록을 불러오지 못했습니다.'))
      .finally(() => { if (gen === genRef.current) setLoading(false) })
  }, [buildParams])

  useEffect(() => { reload() }, [reload])

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

  const refresh = useCallback(async () => { reload() }, [reload])

  // 필터 영속화
  useEffect(() => { sessionStorage.setItem(`${storagePrefix}_view`, view) }, [view, storagePrefix])
  useEffect(() => {
    sessionStorage.setItem(`${storagePrefix}_filter`, JSON.stringify({ query, selectedTags, genderFilter, searchOpen, randomSeed }))
  }, [query, selectedTags, genderFilter, searchOpen, randomSeed, storagePrefix])

  // 스크롤: 위치 저장 + 하단 근접 시 다음 페이지(센티넬 없이 훅 내부에서 처리 → 페이지 수정 불필요)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      sessionStorage.setItem(`${storagePrefix}_scroll_${view}`, String(el.scrollTop))
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) loadMore()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [view, storagePrefix, loadMore])

  const setView = useCallback((v: View) => setViewState(v), [])
  const setSort = useCallback((v: SortOption) => {
    setSortState(v); localStorage.setItem(`${storagePrefix}_sort`, v)
    if (v === 'random') setRandomSeed(Math.floor(Math.random() * 1e9))
  }, [storagePrefix])
  const toggleTag = useCallback((t: string) => setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]), [])
  const clearTags = useCallback(() => setSelectedTags([]), [])
  const toggleSearch = useCallback(() => setSearchOpen(o => {
    if (o) { setQuery(''); setSelectedTags([]); setGenderFilter('all') }
    return !o
  }), [])

  const counts = { active: facets?.counts.active ?? 0, waiting: facets?.counts.waiting ?? 0, completed: facets?.counts.completed ?? 0 }
  const genderBuckets = facets?.genders ?? []
  const tCounts = facets?.tags ?? {}
  const tagGroups = buildTagGroups(Object.keys(tCounts), tagConfig)

  return {
    items, loading, error,
    view, setView, sort, setSort, query, setQuery,
    selectedTags, toggleTag, clearTags, genderFilter, setGenderFilter,
    searchOpen, toggleSearch, randomSeed,
    counts, tagGroups, tCounts, genderBuckets, visibleChars: items,
    isFav, toggleFav, scrollRef, refresh,
  }
}
