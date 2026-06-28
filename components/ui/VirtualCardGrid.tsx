'use client'
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { computeRowHeight, computeVirtualWindow } from '@/lib/virtualWindow'

export default function VirtualCardGrid<T>({
  items, renderItem, scrollRef,
  imageHeightRatio, bodyHeight,
  columns = 2, gap = 12, padX = 16, overscanRows = 2,
}: {
  items: T[]
  renderItem: (item: T) => ReactNode
  scrollRef: RefObject<HTMLElement | null>
  imageHeightRatio: number
  bodyHeight: number
  columns?: number
  gap?: number
  padX?: number
  overscanRows?: number
}) {
  const [metrics, setMetrics] = useState({ scrollTop: 0, viewportHeight: 0, containerWidth: 0 })
  const [measuredRow, setMeasuredRow] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  // 레이아웃 단계에서 측정 → 첫 페인트부터 총높이/윈도우가 정확.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const read = () => setMetrics({ scrollTop: el.scrollTop, viewportHeight: el.clientHeight, containerWidth: el.clientWidth })
    read()
    el.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', read)
    return () => { el.removeEventListener('scroll', read); window.removeEventListener('resize', read) }
  }, [scrollRef])

  // 실제 렌더된 첫 카드 높이 측정 → border 등 계산 오차 보정
  useLayoutEffect(() => {
    const firstCard = gridRef.current?.firstElementChild as HTMLElement | null
    if (!firstCard) return
    const h = firstCard.offsetHeight
    if (h > 0) setMeasuredRow(h + gap)
  }, [metrics.containerWidth, items.length, gap])

  const computedRow = metrics.containerWidth > 0
    ? computeRowHeight({ containerWidth: metrics.containerWidth, columns, gap, padX, imageHeightRatio, bodyHeight })
    : 0
  const rowHeight = measuredRow > 0 ? measuredRow : computedRow
  const win = computeVirtualWindow({
    itemCount: items.length, columns, rowHeight,
    scrollTop: metrics.scrollTop, viewportHeight: metrics.viewportHeight, overscanRows,
  })
  const slice = items.slice(win.startIndex, win.endIndex)

  return (
    <div style={{ paddingTop: win.topPad, paddingBottom: win.bottomPad }}>
      <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap, padding: `0 ${padX}px` }}>
        {slice.map(renderItem)}
      </div>
    </div>
  )
}
