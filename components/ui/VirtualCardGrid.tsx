'use client'
import { type ReactNode, type RefObject } from 'react'

// 측정 기반 가상화 대신 전체 렌더 + CSS content-visibility 사용.
// 화면 밖 카드의 렌더/레이아웃은 브라우저가 자동으로 건너뛴다(.vcg-grid > * 규칙, globals.css).
// 측정이 없어 빈 화면·느린 렌더 루프·뒤로가기 깨짐 같은 회귀가 원천적으로 없다.
// (scrollRef/imageHeightRatio/bodyHeight/overscanRows props는 호환 위해 유지하되 미사용)
export default function VirtualCardGrid<T>({
  items, renderItem, columns = 2, gap = 12, padX = 16,
}: {
  items: T[]
  renderItem: (item: T) => ReactNode
  scrollRef?: RefObject<HTMLElement | null>
  imageHeightRatio?: number
  bodyHeight?: number
  columns?: number
  gap?: number
  padX?: number
  overscanRows?: number
}) {
  return (
    <div className="vcg-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap, padding: `16px ${padX}px` }}>
      {items.map(renderItem)}
    </div>
  )
}
