'use client'
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
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

  const rowHeight = metrics.containerWidth > 0
    ? computeRowHeight({ containerWidth: metrics.containerWidth, columns, gap, padX, imageHeightRatio, bodyHeight })
    : 0
  const win = computeVirtualWindow({
    itemCount: items.length, columns, rowHeight,
    scrollTop: metrics.scrollTop, viewportHeight: metrics.viewportHeight, overscanRows,
  })
  const slice = items.slice(win.startIndex, win.endIndex)

  return (
    <div style={{ paddingTop: win.topPad, paddingBottom: win.bottomPad }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap, padding: `0 ${padX}px` }}>
        {slice.map(renderItem)}
      </div>
    </div>
  )
}
