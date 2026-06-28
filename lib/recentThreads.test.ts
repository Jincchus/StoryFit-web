import { describe, it, expect } from 'vitest'
import { pickLatestNodeIdsPerThread } from './recentThreads'

const n = (id: string, root: string | null, t: string) => ({ id, rootConversationId: root, updatedAt: t })

describe('pickLatestNodeIdsPerThread', () => {
  it('스레드(root+분기)별 updatedAt 최대 노드를 골라 desc 정렬', () => {
    const out = pickLatestNodeIdsPerThread([
      n('a1', null, '2026-06-01T00:00:00Z'),
      n('a2', 'a1', '2026-06-03T00:00:00Z'),   // 스레드 a 최신 = 분기 a2
      n('b1', null, '2026-06-02T00:00:00Z'),   // 스레드 b
    ], 10)
    expect(out).toEqual(['a2', 'b1'])
  })
  it('limit으로 상위 N개만', () => {
    const out = pickLatestNodeIdsPerThread([
      n('a', null, '2026-06-01T00:00:00Z'),
      n('b', null, '2026-06-02T00:00:00Z'),
      n('c', null, '2026-06-03T00:00:00Z'),
    ], 2)
    expect(out).toEqual(['c', 'b'])
  })
})
