'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface MemoryEntry { id: string; summary: string; createdAt: string; promoted: boolean }

export function useMemoryPanel(
  convId: string,
  setToast: (msg: string) => void,
  applyCoreMemory: (value: string) => void,
) {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<Set<string>>(new Set())
  const [expandedPromotedIds, setExpandedPromotedIds] = useState<Set<string>>(new Set())
  const [memoryError, setMemoryError] = useState(false)
  const [promoting, setPromoting] = useState(false)

  useEffect(() => {
    api.get(`/api/conversations/${convId}/memories`).then(setMemories).catch(() => setMemoryError(true))
  }, [convId])

  const handleDeleteMemory = async (memoryId: string) => {
    try {
      await api.delete(`/api/conversations/${convId}/memories`, { memoryId })
      setMemories(prev => prev.filter(m => m.id !== memoryId))
    } catch { setToast('메모리 삭제에 실패했습니다') }
  }

  const handlePromoteMemories = async () => {
    const ids = Array.from(selectedMemoryIds)
    if (!ids.length || promoting) return
    setPromoting(true)
    try {
      const res = await api.post(`/api/conversations/${convId}/memories/promote`, { memoryIds: ids })
      applyCoreMemory(res.coreMemory)
      setMemories(prev => prev.map(m => ids.includes(m.id) ? { ...m, promoted: true } : m))
      setSelectedMemoryIds(new Set())
      setToast('핵심 메모리에 추가됐습니다')
    } catch {
      setToast('핵심 메모리 추가에 실패했습니다')
    } finally {
      setPromoting(false)
    }
  }

  const toggleMemorySelect = (id: string) => {
    setSelectedMemoryIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleExpandPromoted = (id: string) => {
    setExpandedPromotedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return {
    memories, memoryError, promoting,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories,
    toggleMemorySelect, toggleExpandPromoted,
  }
}
