'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useFavorites } from './useFavorites'
import { selectCenterList, type CenterListItem, type CenterListFilter } from './centerListSelect'
import type { CenterTagConfig } from './tagGroups'
import type { SortOption } from './listSort'

type View = CenterListFilter['view']

// 센터별 인덱스 전체 배열을 모듈 스코프에 캐시 → 클라 네비게이션(뒤로가기) 간 즉시 복원.
const indexCache = new Map<string, CenterListItem[]>()

export function useCenterList(opts: { indexQuery: string; storagePrefix: string }) {
  const { indexQuery, storagePrefix } = opts
  const cacheKey = indexQuery

  const { isFav, toggleFav } = useFavorites()
  const [items, setItems] = useState<CenterListItem[]>(() => indexCache.get(cacheKey) ?? [])
  const [loading, setLoading] = useState(() => !indexCache.has(cacheKey))
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)

  // 필터 상태 (초기값은 sessionStorage 복원)
  const [view, setViewState] = useState<View>('active')
  const [sort, setSortState] = useState<SortOption>('latest')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [genderFilter, setGenderFilter] = useState('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1e9))

  const scrollRef = useRef<HTMLDivElement>(null)
  const restored = useRef(false)

  // 초기 상태 복원 + 인덱스 fetch (캐시 있으면 즉시 사용)
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
    if (!indexCache.has(cacheKey)) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data: CenterListItem[] = await api.get(`/api/collections?${indexQuery}&fields=index`)
      indexCache.set(cacheKey, data)
      setItems(data)
    } finally { setLoading(false) }
  }, [indexQuery, cacheKey])

  const refresh = useCallback(async () => { await load() }, [load])

  // 필터 상태 영속화
  useEffect(() => { sessionStorage.setItem(`${storagePrefix}_view`, view) }, [view, storagePrefix])
  useEffect(() => {
    sessionStorage.setItem(`${storagePrefix}_filter`, JSON.stringify({ query, selectedTags, genderFilter, searchOpen, randomSeed }))
  }, [query, selectedTags, genderFilter, searchOpen, randomSeed, storagePrefix])

  // 스크롤 위치 저장 + 복원 (전체 항목이 메모리에 있으므로 가상화 총높이가 정확 → 복원 신뢰성 높음)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => sessionStorage.setItem(`${storagePrefix}_scroll`, String(el.scrollTop))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [storagePrefix])

  useEffect(() => {
    if (loading || restored.current) return
    const el = scrollRef.current
    if (!el) return
    const saved = sessionStorage.getItem(`${storagePrefix}_scroll`)
    if (saved) requestAnimationFrame(() => { el.scrollTop = parseInt(saved, 10) })
    restored.current = true
  }, [loading, storagePrefix])

  // 핸들러
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

  const { counts, tagGroups, tCounts, genderBuckets, visibleChars } = selectCenterList(
    items,
    { view, sort, query, selectedTags, genderFilter, randomSeed },
    tagConfig,
    (id: string) => isFav('collection', id),
  )

  return {
    items, loading,
    view, setView, sort, setSort, query, setQuery,
    selectedTags, toggleTag, clearTags, genderFilter, setGenderFilter,
    searchOpen, toggleSearch, randomSeed,
    counts, tagGroups, tCounts, genderBuckets, visibleChars,
    isFav, toggleFav, scrollRef, refresh,
  }
}
