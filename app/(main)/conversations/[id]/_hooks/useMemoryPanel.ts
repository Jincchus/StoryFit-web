'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface MemoryEntry { id: string; summary: string; createdAt: string; promoted: boolean }

// 한 번에 핵심 메모리로 올릴 수 있는 최대 개수 — promote API의 상한과 일치시킨다.
const PROMOTE_LIMIT = 20

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
      const promotedIds: string[] = res.promotedIds ?? ids
      setMemories(prev => prev.map(m => promotedIds.includes(m.id) ? { ...m, promoted: true } : m))
      setSelectedMemoryIds(new Set())
      setToast('핵심 메모리에 추가됐습니다')
    } catch {
      setToast('핵심 메모리 추가에 실패했습니다')
    } finally {
      setPromoting(false)
    }
  }

  const handleUnpromoteMemory = async (memoryId: string) => {
    try {
      await api.delete(`/api/conversations/${convId}/memories/promote`, { memoryIds: [memoryId] })
      setMemories(prev => prev.map(m => m.id === memoryId ? { ...m, promoted: false } : m))
      setExpandedPromotedIds(prev => {
        const next = new Set(prev)
        next.delete(memoryId)
        return next
      })
    } catch {
      setToast('핵심 메모리 해제에 실패했습니다')
    }
  }

  const toggleMemorySelect = (id: string) => {
    setSelectedMemoryIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 전체선택: 아직 핵심메모리로 올리지 않은(체크박스로 열려 있는) 항목을 한 번에 선택한다.
  // 이미 전부 선택돼 있으면 전체 해제. promote 상한(20)을 넘으면 앞에서부터 상한까지만 선택한다.
  const toggleSelectAllUnpromoted = () => {
    const unpromoted = memories.filter(m => !m.promoted)
    if (unpromoted.length === 0) return
    const targetIds = unpromoted.slice(0, PROMOTE_LIMIT).map(m => m.id)
    const allSelected = targetIds.every(id => selectedMemoryIds.has(id))
    if (allSelected) {
      setSelectedMemoryIds(new Set())
      return
    }
    if (unpromoted.length > PROMOTE_LIMIT) {
      setToast(`한 번에 최대 ${PROMOTE_LIMIT}개까지 올릴 수 있어 처음 ${PROMOTE_LIMIT}개만 선택했습니다`)
    }
    setSelectedMemoryIds(new Set(targetIds))
  }

  const toggleExpandPromoted = (id: string) => {
    setExpandedPromotedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const unpromotedTargets = memories.filter(m => !m.promoted).slice(0, PROMOTE_LIMIT)
  const hasUnpromoted = unpromotedTargets.length > 0
  const allUnpromotedSelected = hasUnpromoted && unpromotedTargets.every(m => selectedMemoryIds.has(m.id))

  return {
    memories, memoryError, promoting,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories, handleUnpromoteMemory,
    toggleMemorySelect, toggleExpandPromoted, toggleSelectAllUnpromoted,
    hasUnpromoted, allUnpromotedSelected,
  }
}
