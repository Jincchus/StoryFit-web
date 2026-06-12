'use client'
import { useEffect, useRef } from 'react'

export function useScrollRestore(key: string, ready: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const restored = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (ready && !restored.current) {
      const saved = sessionStorage.getItem(key)
      if (saved) el.scrollTop = parseInt(saved, 10)
      restored.current = true
    }

    const onScroll = () => sessionStorage.setItem(key, String(el.scrollTop))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [key, ready])

  return ref
}
