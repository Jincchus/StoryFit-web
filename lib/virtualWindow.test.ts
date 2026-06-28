import { describe, it, expect } from 'vitest'
import { computeRowHeight, computeVirtualWindow } from './virtualWindow'

describe('computeRowHeight', () => {
  it('컨테이너 폭에서 열 폭을 빼고 이미지비율+본문+gap으로 행 높이를 구한다', () => {
    // width 400, padX16*2=32, gap12, 2열 → colWidth=(400-32-12)/2=178
    // 이미지높이=178*(4/3)=237.33, +본문104=341.33, +gap12=353.33
    const h = computeRowHeight({ containerWidth: 400, columns: 2, gap: 12, padX: 16, imageHeightRatio: 4 / 3, bodyHeight: 104 })
    expect(Math.round(h)).toBe(353)
  })
})

describe('computeVirtualWindow', () => {
  const base = { columns: 2, rowHeight: 100, viewportHeight: 350, overscanRows: 1 }

  it('빈 목록은 0 윈도우와 0 높이', () => {
    const w = computeVirtualWindow({ ...base, itemCount: 0, scrollTop: 0 })
    expect(w).toEqual({ startIndex: 0, endIndex: 0, topPad: 0, bottomPad: 0, totalHeight: 0 })
  })

  it('맨 위에서는 0행부터 보이는 행+오버스캔까지 렌더', () => {
    // 10개=5행, rowHeight100, viewport350 → 보이는행 ceil(350/100)+1=5, +overscan1 → endRow=min(5,0+5+1)=5
    const w = computeVirtualWindow({ ...base, itemCount: 10, scrollTop: 0 })
    expect(w.startIndex).toBe(0)
    expect(w.endIndex).toBe(10)
    expect(w.topPad).toBe(0)
    expect(w.bottomPad).toBe(0)
    expect(w.totalHeight).toBe(500)
  })

  it('중간 스크롤은 위쪽 행을 잘라내고 topPad를 채운다', () => {
    // 100개=50행, scrollTop 1000 → firstVisibleRow=10, startRow=10-1=9, topPad=900
    const w = computeVirtualWindow({ ...base, itemCount: 100, scrollTop: 1000 })
    expect(w.startIndex).toBe(18) // 9행 * 2열
    expect(w.topPad).toBe(900)    // 9행 * 100
    expect(w.totalHeight).toBe(5000)
    expect(w.bottomPad).toBe(5000 - w.endIndex / 2 * 100)
  })

  it('마지막 행을 넘어 스크롤해도 인덱스가 itemCount를 넘지 않는다', () => {
    const w = computeVirtualWindow({ ...base, itemCount: 7, scrollTop: 99999 })
    expect(w.endIndex).toBe(7)
    expect(w.bottomPad).toBe(0)
  })
})
