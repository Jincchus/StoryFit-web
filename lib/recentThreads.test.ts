import { describe, it, expect } from 'vitest'
import { pickLatestNodeIdsPerThread } from './recentThreads'

const n = (id: string, root: string | null, t: string) => ({ id, rootConversationId: root, updatedAt: t })
const na = (id: string, root: string | null, t: string, isArchived: boolean) => ({ id, rootConversationId: root, updatedAt: t, isArchived })

describe('pickLatestNodeIdsPerThread', () => {
  it('완결(루트 archived) 스레드는 분기가 비-archived여도 제외', () => {
    const out = pickLatestNodeIdsPerThread([
      na('done', null, '2026-06-05T00:00:00Z', true),     // 완결 루트
      na('done-b', 'done', '2026-06-06T00:00:00Z', false), // 그 분기(비archived, 최신)
      na('act', null, '2026-06-04T00:00:00Z', false),      // 진행중 루트
    ], 10)
    expect(out).toEqual(['act'])
  })

  it('개별 archived 노드는 후보에서 제외(진행중 스레드의 비archived 노드 선택)', () => {
    const out = pickLatestNodeIdsPerThread([
      na('r', null, '2026-06-01T00:00:00Z', false),
      na('r-b', 'r', '2026-06-09T00:00:00Z', true), // 최신이지만 archived 분기 → 제외
    ], 10)
    expect(out).toEqual(['r'])
  })

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
