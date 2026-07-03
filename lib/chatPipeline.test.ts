import { describe, it, expect } from 'vitest'
import { sliceStableWindow, buildGeminiHistory } from './chatPipeline'
import { approxTokens } from './ai'

// 한글 1자 ≈ 2토큰(approxTokens) → 500자 메시지 ≈ 1000토큰
const msg = (id: number, chars = 500) => ({ id: String(id), role: id % 2 ? 'user' : 'assistant', content: '가'.repeat(chars), parentId: null })

describe('sliceStableWindow — 프리픽스 안정 히스토리 창', () => {
  it('예산 이내면 전체를 유지한다', () => {
    const messages = [msg(1), msg(2), msg(3)]
    expect(sliceStableWindow(messages)).toEqual(messages)
  })

  it('high를 넘는 순간 low 이하로 절단되고, 이후 high까지 다시 자란다', () => {
    const messages = Array.from({ length: 12 }, (_, i) => msg(i + 1)) // ≈12000토큰
    // i=10번째(누적 10000)에서 절단 발생 → 창 시작이 6번으로 전진(그 시점 5000토큰), 이후 12번까지 성장
    const window = sliceStableWindow(messages, 5000, 9000)
    expect(window[0].id).toBe('6')
    expect(window[window.length - 1].id).toBe('12')
    const total = window.reduce((s, m) => s + approxTokens(m.content), 0)
    expect(total).toBeLessThanOrEqual(9000)
  })

  it('메시지가 추가돼도 절단이 다시 일어나기 전까지 창 시작점이 고정된다', () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg(i + 1)) // 10000토큰 → 절단 발생
    const before = sliceStableWindow(messages, 5000, 9000)
    // 다음 턴: 2000토큰 추가돼도 high(9000) 미만이면 시작점 유지
    const after = sliceStableWindow([...messages, msg(11), msg(12)], 5000, 9000)
    expect(after[0].id).toBe(before[0].id)
    expect(after.slice(0, before.length)).toEqual(before)
  })

  it('결정적이다 — 같은 입력이면 항상 같은 결과', () => {
    const messages = Array.from({ length: 30 }, (_, i) => msg(i + 1, 300 + (i % 7) * 100))
    expect(sliceStableWindow(messages)).toEqual(sliceStableWindow(messages))
  })

  it('거대 메시지 하나여도 minMessages는 보장한다', () => {
    const messages = [msg(1, 6000), msg(2, 100)]
    expect(sliceStableWindow(messages, 5000, 9000).length).toBe(2)
  })
})

describe('buildGeminiHistory — 가변 상태 블록 주입', () => {
  const history = [
    { id: 'a1', role: 'assistant', content: '오프닝 장면' },
    { id: 'u1', role: 'user', content: '안녕' },
    { id: 'a2', role: 'assistant', content: '응답' },
    { id: 'u2', role: 'user', content: '다음 행동' },
  ]

  it('stateBlock은 마지막 user 턴 맨 앞에 주입된다', () => {
    const turns = buildGeminiHistory(history, 'u2', false, false, '[시스템 상태 주입 — 유저 발화 아님]\n상태')
    const lastUser = turns[turns.length - 1]
    expect(lastUser.role).toBe('user')
    expect(lastUser.parts[0].text.startsWith('[시스템 상태 주입 — 유저 발화 아님]')).toBe(true)
    expect(lastUser.parts[0].text).toContain('다음 행동')
    // 앞선 턴들은 그대로(프리픽스 불변)
    expect(turns[0].parts[0].text).toBe('오프닝 장면')
    expect(turns[1].parts[0].text).toBe('안녕')
  })

  it('stateBlock이 없으면 기존 동작과 동일하다', () => {
    const withEmpty = buildGeminiHistory(history, undefined, false, false, '')
    const without = buildGeminiHistory(history, undefined, false)
    expect(withEmpty).toEqual(without)
  })

  it('user 턴이 하나도 없으면 stateBlock을 마지막 user 턴으로 추가한다', () => {
    const onlyModel = [{ id: 'a1', role: 'assistant', content: '오프닝' }]
    const turns = buildGeminiHistory(onlyModel, undefined, false, false, '상태블록')
    expect(turns[turns.length - 1]).toEqual({ role: 'user', parts: [{ text: '상태블록' }] })
  })
})
