'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface NameEntry { id: string; name: string; category: string }
type Cat = 'korean' | 'western'

export default function AdminNamesPage() {
  const [names, setNames] = useState<NameEntry[]>([])
  const [input, setInput] = useState('')
  const [cat, setCat] = useState<Cat>('korean')
  const [bulkInput, setBulkInput] = useState('')
  const [bulkCat, setBulkCat] = useState<Cat>('korean')
  const [showBulk, setShowBulk] = useState(false)
  const [filter, setFilter] = useState<'all' | Cat>('all')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/names').then(setNames).catch(() => {})
  }, [])

  const handleAdd = async () => {
    const name = input.trim()
    if (!name) return
    setError('')
    try {
      const created = await api.post('/api/admin/names', { name, category: cat })
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
        const created = await api.post('/api/admin/names', { name, category: bulkCat })
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

  const filtered = filter === 'all' ? names : names.filter(n => n.category === filter)

  return (
    <Win title="관리자 — 랜덤 이름" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/names" />

        <div className="vstack" style={{ gap: 6 }}>
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            <input
              className="field" style={{ flex: 1, minWidth: 120 }}
              placeholder="이름 입력"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            />
            <div className="hstack" style={{ gap: 3 }}>
              {(['korean', 'western'] as Cat[]).map(c => (
                <button key={c} className={`btn ${cat === c ? 'primary' : 'ghost'}`}
                  style={{ fontSize: 10, padding: '3px 7px' }} onClick={() => setCat(c)}>
                  {c === 'korean' ? '한국' : '서양'}
                </button>
              ))}
            </div>
            <button className="btn primary" onClick={handleAdd}>추가</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowBulk(s => !s)}>일괄</button>
          </div>

          {showBulk && (
            <div className="vstack" style={{ gap: 6, padding: 8, background: 'var(--pane)', border: '1px solid var(--chrome-border)' }}>
              <div className="hstack" style={{ gap: 6 }}>
                <span className="tiny muted">카테고리:</span>
                {(['korean', 'western'] as Cat[]).map(c => (
                  <button key={c} className={`btn ${bulkCat === c ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setBulkCat(c)}>
                    {c === 'korean' ? '한국식' : '서양식'}
                  </button>
                ))}
              </div>
              <textarea
                className="field" rows={6}
                placeholder={"이름을 한 줄에 하나씩 입력하세요"}
                value={bulkInput} onChange={e => setBulkInput(e.target.value)}
              />
              <div className="hstack" style={{ gap: 4 }}>
                <button className="btn primary" style={{ fontSize: 10 }} onClick={handleBulkAdd}>일괄 추가</button>
                <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowBulk(false)}>취소</button>
              </div>
            </div>
          )}
        </div>

        {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}

        <div className="hstack" style={{ gap: 6, alignItems: 'center' }}>
          {(['all', 'korean', 'western'] as const).map(f => (
            <button key={f} className={`btn ${filter === f ? 'primary' : 'ghost'}`}
              style={{ fontSize: 10, padding: '2px 7px' }} onClick={() => setFilter(f)}>
              {f === 'all' ? `전체 (${names.length})` : f === 'korean' ? `한국식 (${names.filter(n => n.category === 'korean').length})` : `서양식 (${names.filter(n => n.category === 'western').length})`}
            </button>
          ))}
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filtered.map(n => (
              <div key={n.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', fontSize: 11 }}>
                <span style={{ fontSize: 9, color: n.category === 'korean' ? 'var(--purple)' : 'var(--pink)', marginRight: 2 }}>
                  {n.category === 'korean' ? 'KR' : 'EN'}
                </span>
                <span>{n.name}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }}
                  onClick={() => handleDelete(n.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Win>
  )
}
