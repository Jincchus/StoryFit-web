import { describe, it, expect } from 'vitest'
import { aggregateCounts, isCompleted, hasArchived, type CountableConversation } from './completion'

const conv = (over: Partial<CountableConversation>): CountableConversation => ({
  isArchived: false,
  rootConversationId: null,
  mode: 'story',
  ...over,
})

describe('aggregateCounts', () => {
  it('활성/서재 대화를 각각 센다', () => {
    const result = aggregateCounts([
      conv({ isArchived: false }),
      conv({ isArchived: true }),
      conv({ isArchived: true }),
    ])
    expect(result).toEqual({ activeCount: 1, archivedCount: 2 })
  })

  it('브랜치 대화(rootConversationId != null)는 제외한다', () => {
    const result = aggregateCounts([
      conv({ isArchived: false, rootConversationId: 'root-1' }),
      conv({ isArchived: false }),
    ])
    expect(result).toEqual({ activeCount: 1, archivedCount: 0 })
  })

  it('assistant 모드 대화는 제외한다', () => {
    const result = aggregateCounts([
      conv({ isArchived: true, mode: 'assistant' }),
      conv({ isArchived: true, mode: 'story' }),
    ])
    expect(result).toEqual({ activeCount: 0, archivedCount: 1 })
  })

  it('빈 배열은 0/0', () => {
    expect(aggregateCounts([])).toEqual({ activeCount: 0, archivedCount: 0 })
  })
})

describe('isCompleted', () => {
  it('활성 0 + 서재 1개 이상이면 완결', () => {
    expect(isCompleted({ activeCount: 0, archivedCount: 2 })).toBe(true)
  })
  it('활성이 남아있으면 완결 아님', () => {
    expect(isCompleted({ activeCount: 1, archivedCount: 3 })).toBe(false)
  })
  it('대화가 하나도 없으면 완결 아님', () => {
    expect(isCompleted({ activeCount: 0, archivedCount: 0 })).toBe(false)
  })
})

describe('hasArchived', () => {
  it('서재 대화가 1개 이상이면 true', () => {
    expect(hasArchived({ activeCount: 2, archivedCount: 1 })).toBe(true)
  })
  it('서재 대화가 없으면 false', () => {
    expect(hasArchived({ activeCount: 3, archivedCount: 0 })).toBe(false)
  })
})
