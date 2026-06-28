import { describe, it, expect } from 'vitest'
import { selectCenterList, type CenterListItem, type CenterListFilter } from './centerListSelect'

const mk = (over: Partial<CenterListItem>): CenterListItem => ({
  id: 'x', title: 't', tags: [], characters: [], ...over,
})

const items: CenterListItem[] = [
  mk({ id: 'a', title: '가', tags: ['로맨스'], started: true, completed: false, createdAt: '2026-01-01', characters: [{ id: 'c1', name: 'A', avatarUrl: null, gender: 'female' }] }),
  mk({ id: 'b', title: '나', tags: ['로맨스', '판타지'], started: false, completed: false, createdAt: '2026-02-01', characters: [{ id: 'c2', name: 'B', avatarUrl: null, gender: 'male' }] }),
  mk({ id: 'c', title: '다', tags: ['판타지'], started: true, completed: true, createdAt: '2026-03-01', characters: [{ id: 'c3', name: 'C', avatarUrl: null, gender: 'female' }] }),
]
const baseFilter: CenterListFilter = { view: 'active', sort: 'latest', query: '', selectedTags: [], genderFilter: 'all', randomSeed: 0 }
const noFav = () => false

describe('selectCenterList', () => {
  it('counts는 필터와 무관하게 전체 총합', () => {
    const v = selectCenterList(items, { ...baseFilter, view: 'active', query: '가', selectedTags: ['로맨스'] }, null, noFav)
    expect(v.counts).toEqual({ active: 1, waiting: 1, completed: 1 })
  })

  it('view=active는 시작했고 미완결인 항목만', () => {
    const v = selectCenterList(items, { ...baseFilter, view: 'active' }, null, noFav)
    expect(v.visibleChars.map(i => i.id)).toEqual(['a'])
  })

  it('view=waiting은 미시작 항목만', () => {
    const v = selectCenterList(items, { ...baseFilter, view: 'waiting' }, null, noFav)
    expect(v.visibleChars.map(i => i.id)).toEqual(['b'])
  })

  it('view=completed는 완결 항목만', () => {
    const v = selectCenterList(items, { ...baseFilter, view: 'completed' }, null, noFav)
    expect(v.visibleChars.map(i => i.id)).toEqual(['c'])
  })

  it('view=favorites는 isFav가 true인 항목만', () => {
    const v = selectCenterList(items, { ...baseFilter, view: 'favorites' }, null, id => id === 'b')
    expect(v.visibleChars.map(i => i.id)).toEqual(['b'])
  })

  it('태그 필터는 view 결과를 추가로 좁힌다', () => {
    const v = selectCenterList(items, { ...baseFilter, view: 'completed', selectedTags: ['로맨스'] }, null, noFav)
    expect(v.visibleChars).toEqual([])
  })

  it('정렬 latest는 createdAt 내림차순', () => {
    // completed 탭이 아니라 전체가 보이도록 favorites로 모두 true
    const v = selectCenterList(items, { ...baseFilter, view: 'favorites', sort: 'latest' }, null, () => true)
    expect(v.visibleChars.map(i => i.id)).toEqual(['c', 'b', 'a'])
  })
})
