// 센터 리스트의 카운트/필터/정렬을 한 번에 계산하는 순수 셀렉터.
// counts는 항상 전체 총합(필터 무관), visibleChars는 view+검색+성별+태그+정렬 적용 결과.
import { sortByOption, type SortOption } from './listSort'
import { viewCounts, tagCounts, type ViewCounts } from './centerCounts'
import { buildTagGroups, type CenterTagConfig } from './tagGroups'
import { availableGenderBuckets, cardGenderBucket } from './cardGender'

export interface CenterListItem {
  id: string
  title: string
  sourceUrl?: string
  coverImageUrl?: string
  description?: string
  tags: string[]
  createdAt?: string
  lastActivityAt?: string
  completed?: boolean
  started?: boolean
  characters: { id: string; name: string; avatarUrl: string | null; gender?: string | null }[]
  // 센터별 메타(passthrough) — index에 포함. zeta: shortDescription, tikita: tagline 등.
  zetaMeta?: any
  meltingMeta?: any
  tikitaMeta?: any
}

export interface CenterListFilter {
  view: 'active' | 'waiting' | 'completed' | 'favorites'
  sort: SortOption
  query: string
  selectedTags: string[]
  genderFilter: string // 'all' | GenderBucket
  randomSeed: number
}

export interface CenterListView {
  counts: ViewCounts
  tagGroups: ReturnType<typeof buildTagGroups>
  tCounts: Record<string, number>
  genderBuckets: ReturnType<typeof availableGenderBuckets>
  visibleChars: CenterListItem[]
}

export function selectCenterList(
  items: CenterListItem[],
  filter: CenterListFilter,
  tagConfig: CenterTagConfig | null,
  isFav: (id: string) => boolean,
): CenterListView {
  const { view, sort, query, selectedTags, genderFilter, randomSeed } = filter
  const q = query.trim().toLowerCase()

  const viewMatch = (c: CenterListItem) =>
    view === 'favorites' ? isFav(c.id)
    : view === 'completed' ? !!c.completed
    : view === 'waiting' ? !c.started
    : !c.completed && !!c.started

  const matchesQuery = (c: CenterListItem) =>
    !q || c.title.toLowerCase().includes(q) || (c.tags ?? []).some(t => t.toLowerCase().includes(q))
  const matchesTag = (c: CenterListItem) =>
    selectedTags.length === 0 || selectedTags.every(t => (c.tags ?? []).includes(t))
  const matchesGender = (c: CenterListItem) =>
    genderFilter === 'all' || cardGenderBucket(c.characters) === genderFilter

  // counts: 전체 총합(필터 무관)
  const counts = viewCounts(items)
  const genderBuckets = availableGenderBuckets(items)

  // 태그 목록/카운트 base: view+성별+검색 적용(태그 제외)
  const tagBase = items.filter(c => viewMatch(c) && matchesGender(c) && matchesQuery(c))
  const tagGroups = buildTagGroups(tagBase.flatMap(c => c.tags ?? []), tagConfig)
  const tCounts = tagCounts(tagBase)

  const visibleChars = sortByOption(
    tagBase.filter(matchesTag),
    sort,
    c => c.title,
    c => c.createdAt ?? '',
    c => c.lastActivityAt ?? c.createdAt ?? '',
    randomSeed,
  )

  return { counts, tagGroups, tCounts, genderBuckets, visibleChars }
}
