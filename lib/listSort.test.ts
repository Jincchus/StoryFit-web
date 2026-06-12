import { describe, it, expect } from 'vitest'
import { sortByOption } from './listSort'

interface Item { id: string; title: string; createdAt: string }

const items: Item[] = [
  { id: '1', title: '나비', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', title: '가나', createdAt: '2026-03-01T00:00:00.000Z' },
  { id: '3', title: '다라', createdAt: '2026-02-01T00:00:00.000Z' },
]

describe('sortByOption', () => {
  it('latest는 createdAt 내림차순으로 정렬한다', () => {
    const result = sortByOption(items, 'latest', i => i.title, i => i.createdAt)
    expect(result.map(i => i.id)).toEqual(['2', '3', '1'])
  })

  it('alpha는 한글 가나다순으로 정렬한다', () => {
    const result = sortByOption(items, 'alpha', i => i.title, i => i.createdAt)
    expect(result.map(i => i.id)).toEqual(['2', '1', '3'])
  })

  it('원본 배열을 변경하지 않는다', () => {
    const original = [...items]
    sortByOption(items, 'alpha', i => i.title, i => i.createdAt)
    expect(items).toEqual(original)
  })
})
