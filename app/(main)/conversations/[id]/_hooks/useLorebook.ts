'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface LbEntry { id: string; keyword: string[]; content: string; priority: number; scanDepth: number }

export function useLorebook(convId: string, setToast: (msg: string) => void) {
  const [lorebooks, setLorebooks] = useState<LbEntry[]>([])
  const [lorebookAdd, setLorebookAdd] = useState(false)
  const [lorebookEditId, setLorebookEditId] = useState<string | null>(null)
  const [lbForm, setLbForm] = useState({ keywords: '', content: '', priority: 0, scanDepth: 5 })
  const [lorebookError, setLorebookError] = useState(false)

  useEffect(() => {
    api.get(`/api/lorebooks?conversationId=${convId}`).then(setLorebooks).catch(() => setLorebookError(true))
  }, [convId])

  const handleAddLorebook = async () => {
    const keyword = lbForm.keywords.split(',').map(k => k.trim()).filter(Boolean)
    if (!keyword.length || !lbForm.content.trim()) return
    try {
      const entry = await api.post('/api/lorebooks', {
        keyword, content: lbForm.content, priority: lbForm.priority, scanDepth: lbForm.scanDepth,
        conversationId: convId, scope: 'conversation', scopeId: convId,
      })
      setLorebooks(prev => [...prev, entry])
      setLbForm({ keywords: '', content: '', priority: 0, scanDepth: 5 })
      setLorebookAdd(false)
    } catch { setToast('로어북 추가에 실패했습니다') }
  }

  const handlePatchLorebook = async (id: string, data: Partial<LbEntry>) => {
    try {
      const updated = await api.patch(`/api/lorebooks/${id}`, data)
      setLorebooks(prev => prev.map(e => e.id === id ? updated : e))
      setLorebookEditId(null)
    } catch { setToast('로어북 수정에 실패했습니다') }
  }

  const handleDeleteLorebook = async (id: string) => {
    try {
      await api.delete(`/api/lorebooks/${id}`)
      setLorebooks(prev => prev.filter(e => e.id !== id))
    } catch { setToast('로어북 삭제에 실패했습니다') }
  }

  return {
    lorebooks, lorebookAdd, setLorebookAdd,
    lorebookEditId, setLorebookEditId,
    lbForm, setLbForm,
    lorebookError,
    handleAddLorebook, handlePatchLorebook, handleDeleteLorebook,
  }
}
