'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface MemoryEntry { id: string; summary: string; createdAt: string }

export function useMemoryPanel(
  convId: string,
  setToast: (msg: string) => void,
  handleCoreMemory: (value: string) => void,
  coreMemory: string,
) {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<Set<string>>(new Set())
  const [expandedPromotedIds, setExpandedPromotedIds] = useState<Set<string>>(new Set())
  const [memoryError, setMemoryError] = useState(false)

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
    const selected = memories.filter(m => selectedMemoryIds.has(m.id))
    if (!selected.length) return
    const added = selected.map(m => m.summary).join('\n\n')
    const updated = coreMemory.trim() ? coreMemory.trim() + '\n\n' + added : added
    handleCoreMemory(updated)
    setSelectedMemoryIds(new Set())
    setToast('핵심 메모리에 추가됐습니다')
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
    memories, memoryError,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories,
    toggleMemorySelect, toggleExpandPromoted,
  }
}
