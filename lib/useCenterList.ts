'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { useFavorites } from './useFavorites'
import { selectCenterList, type CenterListItem, type CenterListFilter } from './centerListSelect'
import type { CenterTagConfig } from './tagGroups'
import type { SortOption } from './listSort'

type View = CenterListFilter['view']

// 센터별 인덱스 전체 배열을 모듈 스코프에 캐시 → 클라 네비게이션(뒤로가기) 간 즉시 복원.
const indexCache = new Map<string, CenterListItem[]>()

export function useCenterList(opts: {
  indexQuery: string
  storagePrefix: string
  // 다른 엔드포인트(예: /api/characters)·즐겨찾기 타입·데이터 매퍼 — whif/tingle 등 다중 데이터/탭용.
  endpoint?: string
  appendIndexParam?: boolean // /api/collections는 &fields=index 부착, /api/characters는 미부착
  favType?: 'collection' | 'character'
  mapItems?: (raw: CenterListItem[]) => CenterListItem[] // select 전에 적용(원본 items는 그대로 반환)
}) {
  const { indexQuery, storagePrefix, endpoint = '/api/collections', appendIndexParam = true, favType = 'collection', mapItems } = opts
  const cacheKey = `${endpoint}?${indexQuery}`

  const { isFav, toggleFav } = useFavorites()
  const [items, setItems] = useState<CenterListItem[]>(() => indexCache.get(cacheKey) ?? [])
  const [loading, setLoading] = useState(() => !indexCache.has(cacheKey))
  const [error, setError] = useState<string | null>(null)
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
    const hadCache = indexCache.has(cacheKey)
    void load(hadCache) // 캐시 있으면 silent 재검증, 없으면 일반 로드(스피너)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const url = appendIndexParam ? `${endpoint}?${indexQuery}&fields=index` : `${endpoint}?${indexQuery}`
      const data: CenterListItem[] = await api.get(url)
      indexCache.set(cacheKey, data); setItems(data); setError(null)
    } catch {
      if (!silent) setError('목록을 불러오지 못했습니다.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [endpoint, indexQuery, appendIndexParam, cacheKey])

  const refresh = useCallback(async () => { await load() }, [load])

  // 필터 상태 영속화
  useEffect(() => { sessionStorage.setItem(`${storagePrefix}_view`, view) }, [view, storagePrefix])
  useEffect(() => {
    sessionStorage.setItem(`${storagePrefix}_filter`, JSON.stringify({ query, selectedTags, genderFilter, searchOpen, randomSeed }))
  }, [query, selectedTags, genderFilter, searchOpen, randomSeed, storagePrefix])

  // 스크롤 위치 저장 (뷰별 키)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => sessionStorage.setItem(`${storagePrefix}_scroll_${view}`, String(el.scrollTop))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [view, storagePrefix])

  // 스크롤 복원 (뷰 전환·로드 완료 시 해당 뷰 저장값 또는 0)
  useEffect(() => {
    if (loading) return
    const el = scrollRef.current
    if (!el) return
    const saved = sessionStorage.getItem(`${storagePrefix}_scroll_${view}`)
    requestAnimationFrame(() => { el.scrollTop = saved ? parseInt(saved, 10) : 0 })
  }, [view, loading, storagePrefix])

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

  const favView = useCallback((id: string) => isFav(favType, id), [isFav, favType])
  const mapped = useMemo(() => (mapItems ? mapItems(items) : items), [items, mapItems])
  const { counts, tagGroups, tCounts, genderBuckets, visibleChars } = useMemo(
    () => selectCenterList(mapped, { view, sort, query, selectedTags, genderFilter, randomSeed }, tagConfig, favView),
    [mapped, view, sort, query, selectedTags, genderFilter, randomSeed, tagConfig, favView],
  )

  return {
    items, loading, error,
    view, setView, sort, setSort, query, setQuery,
    selectedTags, toggleTag, clearTags, genderFilter, setGenderFilter,
    searchOpen, toggleSearch, randomSeed,
    counts, tagGroups, tCounts, genderBuckets, visibleChars,
    isFav, toggleFav, scrollRef, refresh,
  }
}
