'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import { AdminNav } from '../page'

interface NameEntry { id: string; name: string }

export default function AdminNamesPage() {
  const [names, setNames] = useState<NameEntry[]>([])
  const [input, setInput] = useState('')
  const [bulkInput, setBulkInput] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/names').then(setNames).catch(() => {})
  }, [])

  const handleAdd = async () => {
    const name = input.trim()
    if (!name) return
    setError('')
    try {
      const created = await api.post('/api/admin/names', { name })
      setNames(prev => [...prev, created])
      setInput('')
    } catch (e: any) { setError(e.message) }
  }

  const handleBulkAdd = async () => {
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return
    setError('')
    let added = 0
    for (const name of lines) {
      try {
        const created = await api.post('/api/admin/names', { name })
        setNames(prev => [...prev, created])
        added++
      } catch {}
    }
    setBulkInput('')
    setShowBulk(false)
    if (added < lines.length) setError(`${lines.length - added}개는 중복이어서 건너뜀`)
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/api/admin/names/${id}`)
    setNames(prev => prev.filter(n => n.id !== id))
  }

  return (
    <Win title="관리자 — 랜덤 이름" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/names" />

        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
          <input
            className="field" style={{ flex: 1, minWidth: 120 }}
            placeholder="이름 입력 후 추가"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <button className="btn primary" onClick={handleAdd}>추가</button>
          <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowBulk(s => !s)}>
            일괄 입력
          </button>
        </div>

        {showBulk && (
          <div className="vstack" style={{ gap: 6 }}>
            <textarea
              className="field" rows={6}
              placeholder={"이름을 한 줄에 하나씩 입력하세요\n루나\n카엘룸\n셰이드"}
              value={bulkInput}
              onChange={e => setBulkInput(e.target.value)}
            />
            <div className="hstack" style={{ gap: 4 }}>
              <button className="btn primary" style={{ fontSize: 10 }} onClick={handleBulkAdd}>일괄 추가</button>
              <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowBulk(false)}>취소</button>
            </div>
          </div>
        )}

        {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}

        <div className="tiny muted">총 {names.length}개</div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {names.map(n => (
              <div key={n.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', fontSize: 11 }}>
                <span>{n.name}</span>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }}
                  onClick={() => handleDelete(n.id)}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Win>
  )
}
