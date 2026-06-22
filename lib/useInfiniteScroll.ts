'use client'
import { useEffect, useRef, useState } from 'react'

export function useInfiniteScroll(
  deps: unknown[],
  scrollRef: React.RefObject<HTMLElement | null>,
  pageSize = 30,
) {
  const [count, setCount] = useState(pageSize)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // deps 변경 시 카운트 리셋
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCount(pageSize) }, deps)

  // 스크롤 컨테이너 기준 IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root) return
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setCount(c => c + pageSize) },
      { root, rootMargin: '300px' },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  })

  return { count, sentinelRef }
}
