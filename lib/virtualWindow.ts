// 센터 리스트 가상 스크롤의 순수 계산. 측정값(폭/스크롤/뷰포트)을 받아 렌더 윈도우를 돌려준다.

export interface VirtualWindow {
  startIndex: number  // 렌더 시작 항목 인덱스(포함)
  endIndex: number    // 렌더 끝 항목 인덱스(제외)
  topPad: number      // 윈도우 위 스페이서 높이 px
  bottomPad: number   // 윈도우 아래 스페이서 높이 px
  totalHeight: number // 전체 행 높이 합 px
}

// 반응형 이미지(aspect-ratio) 카드의 한 행 높이. 열 폭에서 카드 폭을 구하고
// 이미지 높이(폭*비율) + 고정 본문 + gap 을 더한다.
export function computeRowHeight(p: {
  containerWidth: number; columns: number; gap: number; padX: number
  imageHeightRatio: number; bodyHeight: number
}): number {
  const inner = p.containerWidth - 2 * p.padX - (p.columns - 1) * p.gap
  const colWidth = Math.max(0, inner / p.columns)
  return colWidth * p.imageHeightRatio + p.bodyHeight + p.gap
}

export function computeVirtualWindow(p: {
  itemCount: number; columns: number; rowHeight: number
  scrollTop: number; viewportHeight: number; overscanRows?: number
}): VirtualWindow {
  const overscan = p.overscanRows ?? 2
  const totalRows = Math.ceil(p.itemCount / p.columns)
  const totalHeight = totalRows * p.rowHeight
  if (p.itemCount === 0 || p.rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, topPad: 0, bottomPad: 0, totalHeight: 0 }
  }
  const firstVisibleRow = Math.floor(p.scrollTop / p.rowHeight)
  const visibleRowCount = Math.ceil(p.viewportHeight / p.rowHeight) + 1
  const startRow = Math.max(0, firstVisibleRow - overscan)
  const endRow = Math.min(totalRows, firstVisibleRow + visibleRowCount + overscan)
  const startIndex = startRow * p.columns
  const endIndex = Math.min(p.itemCount, endRow * p.columns)
  return {
    startIndex,
    endIndex,
    topPad: startRow * p.rowHeight,
    bottomPad: Math.max(0, (totalRows - endRow) * p.rowHeight),
    totalHeight,
  }
}
