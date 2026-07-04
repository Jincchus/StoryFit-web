'use client'
// 내 캐릭터 라이브러리(app/(main)/characters)의 데이터 로드 + 필터/정렬/패싯 계산을 담당하는 훅.
// 선택모드·가져오기·복제·삭제 같은 뮤테이션 UI는 페이지 컴포넌트에 남기고, 여기선 목록/필터 상태만.
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { sortByOption, type SortOption } from './listSort'
import { buildTagGroups, type CenterTagConfig } from './tagGroups'
import { tagCounts as computeTagCounts } from './centerCounts'
import { CENTERS } from './centers'
import type { Character } from '@/types'

// 캐릭터가 속한 센터 키를 collection.sourceUrl로 판별. 없거나 외부 센터가 아니면 'none'.
export function centerKeyOf(c: Character): string {
  const url = c.collection?.sourceUrl ?? ''
  if (!url) return 'none'
  return CENTERS.find(ctr => ctr.dbHosts.some(h => url.includes(h)))?.key ?? 'none'
}

// 성별 원시값을 버킷으로 정규화. ⚠️ 'female'이 'male'을 부분 포함하므로 female을 먼저 검사.
export function genderBucket(g?: string): 'male' | 'female' | 'none' {
  const s = (g ?? '').toLowerCase()
  if (s.includes('female') || s.includes('여')) return 'female'
  if (s.includes('male') || s.includes('남')) return 'male'
  return 'none'
}
export const GENDER_LABEL: Record<string, string> = { male: '남성', female: '여성', none: '기타·미설정' }

export type LibView = 'active' | 'waiting' | 'completed'

export function useCharacterLibrary() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tagConfig, setTagConfig] = useState<CenterTagConfig | null>(null)

  const [view, setView] = useState<LibView>('active')
  const [personaView, setPersonaView] = useState(false) // 페르소나 프리셋 보기(편집/삭제용). 평소엔 숨김.
  const [collectionFilter, setCollectionFilter] = useState<string>('all')
  const [roomFilter, setRoomFilter] = useState<string>('all')
  const [centerFilter, setCenterFilter] = useState<string>('all')
  const [genderFilter, setGenderFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortOption>('latest')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTab, setSearchTab] = useState<'text' | 'tag'>('text')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  useEffect(() => {
    api.get('/api/characters').then((data: Character[]) => { setCharacters(data); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) })
    api.get('/api/center-tags').then(setTagConfig).catch(() => {})
  }, [])

  const toggleTag = (tag: string) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  const clearTags = () => setSelectedTags([])
  const resetSearch = () => { setQuery(''); setSelectedTags([]) }

  // view 1차 분류(페르소나 보기면 프리셋만·구분 없음, 아니면 프리셋 제외)
  const viewBase = useMemo(() => {
    const base = characters.filter(c => personaView ? c.isPersonaPreset : !c.isPersonaPreset)
    if (personaView) return base
    if (view === 'completed') return base.filter(c => c.completed)
    if (view === 'waiting') return base.filter(c => !c.completed && !c.started)
    return base.filter(c => !c.completed && c.started)
  }, [characters, view, personaView])

  const availableCenters = useMemo(() => {
    const counts = new Map<string, number>()
    viewBase.forEach(c => { const k = centerKeyOf(c); counts.set(k, (counts.get(k) ?? 0) + 1) })
    const list = CENTERS.filter(ctr => counts.has(ctr.key)).map(ctr => ({ key: ctr.key, label: ctr.label, count: counts.get(ctr.key)! }))
    if (counts.has('none')) list.push({ key: 'none', label: '미분류·직접만든', count: counts.get('none')! })
    return list
  }, [viewBase])

  const centerBase = useMemo(() => {
    if (personaView || view === 'completed' || centerFilter === 'all') return viewBase
    return viewBase.filter(c => centerKeyOf(c) === centerFilter)
  }, [viewBase, centerFilter, view, personaView])

  const availableGenders = useMemo(() => {
    const counts = new Map<string, number>()
    centerBase.forEach(c => { const b = genderBucket(c.gender); counts.set(b, (counts.get(b) ?? 0) + 1) })
    return (['male', 'female', 'none'] as const)
      .filter(b => counts.has(b))
      .map(b => ({ key: b, label: GENDER_LABEL[b], count: counts.get(b)! }))
  }, [centerBase])

  const collections = useMemo(() => {
    const map = new Map<string, string>()
    centerBase.forEach(c => { if (c.collection) map.set(c.collection.id, c.collection.title) })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [centerBase])

  const completedRooms = useMemo(() => {
    const map = new Map<string, string>()
    characters.filter(c => c.completed).forEach(c => { c.rooms?.forEach(r => map.set(r.id, r.title)) })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [characters])

  const tagGroups = useMemo(() => buildTagGroups(centerBase.flatMap(c => c.tags ?? []), tagConfig), [centerBase, tagConfig])
  const tCounts = useMemo(() => computeTagCounts(centerBase), [centerBase])

  const filteredCharacters = useMemo(() => {
    let r = centerBase
    if (view === 'completed') {
      if (roomFilter !== 'all') r = r.filter(c => c.rooms?.some(rm => rm.id === roomFilter))
    } else {
      if (collectionFilter === 'none') r = r.filter(c => !c.collection && !c.isPreset)
      else if (collectionFilter !== 'all') r = r.filter(c => c.collection?.id === collectionFilter)
    }
    if (genderFilter !== 'all') r = r.filter(c => genderBucket(c.gender) === genderFilter)
    const q = query.trim().toLowerCase()
    if (q) r = r.filter(c => c.name.toLowerCase().includes(q) || (c.collection?.title ?? '').toLowerCase().includes(q))
    if (selectedTags.length > 0) r = r.filter(c => selectedTags.every(t => (c.tags ?? []).includes(t)))
    return sortByOption(r, sort, c => c.name, c => c.createdAt ?? '', c => c.createdAt ?? '')
  }, [centerBase, view, collectionFilter, roomFilter, genderFilter, query, selectedTags, sort])

  const selectableInFilter = useMemo(() => filteredCharacters.filter(c => !c.isPreset), [filteredCharacters])

  return {
    characters, setCharacters, loading, error, setError, tagConfig,
    view, setView, personaView, setPersonaView,
    collectionFilter, setCollectionFilter, roomFilter, setRoomFilter,
    centerFilter, setCenterFilter, genderFilter, setGenderFilter,
    sort, setSort, searchOpen, setSearchOpen, searchTab, setSearchTab,
    query, setQuery, selectedTags, toggleTag, clearTags, resetSearch,
    availableCenters, availableGenders, collections, completedRooms,
    tagGroups, tCounts, filteredCharacters, selectableInFilter,
  }
}
