'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { RANDOM_NAMES } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'

type NameEntry = { name: string; category: string; gender: string }

interface Persona {
  id: string
  name: string
  gender: string
  description: string
  additionalInfo: string
}


export default function PersonasPage() {
  const router = useRouter()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', gender: '', description: '', additionalInfo: '' })
  const [loading, setLoading] = useState(false)
  const [namePool, setNamePool] = useState<NameEntry[]>([])
  const [nameCat, setNameCat] = useState<'all' | 'korean' | 'western'>('all')

  useEffect(() => {
    api.get('/api/personas').then(setPersonas).catch(() => {})
    fetch('/api/names').then(r => r.json()).then(setNamePool).catch(() => {})
  }, [])

  const openCreate = () => { setForm({ name: '', gender: '', description: '', additionalInfo: '' }); setCreating(true); setEditingId(null) }
  const openEdit = (p: Persona) => { setForm({ name: p.name, gender: p.gender ?? '', description: p.description, additionalInfo: p.additionalInfo }); setEditingId(p.id); setCreating(false) }

  const handleSave = async () => {
    if (!form.name.trim() || loading) return
    setLoading(true)
    try {
      if (creating) {
        const created = await api.post('/api/personas', form)
        setPersonas(prev => [...prev, created])
      } else if (editingId) {
        const updated = await api.patch(`/api/personas/${editingId}`, form)
        setPersonas(prev => prev.map(p => p.id === editingId ? updated : p))
      }
      setCreating(false); setEditingId(null)
    } catch {} finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/api/personas/${id}`)
    setPersonas(prev => prev.filter(p => p.id !== id))
  }

  const isFormOpen = creating || !!editingId

  return (
    <Win title="내 페르소나 (My Persona)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>내 페르소나</div>
            <div className="tiny muted">AI가 나를 어떻게 부를지 설정하세요</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 6 }}>
            <button className="btn ghost" onClick={() => router.push('/')}>← 뒤로</button>
            <button className="btn primary" onClick={openCreate}>+ 새 페르소나</button>
          </div>
        </div>

        {isFormOpen && (
          <div className="win" style={{ flexShrink: 0 }}>
            <div className="win-title">
              <div className="win-title-l"><span>{creating ? '새 페르소나 만들기' : '페르소나 편집'}</span></div>
              <div className="win-controls"><button onClick={() => { setCreating(false); setEditingId(null) }}>×</button></div>
            </div>
            <div className="win-body vstack" style={{ gap: 8 }}>
              <div className="form-grid">
                <div>
                  <label className="label">이름 *</label>
                  <div className="hstack" style={{ gap: 4 }}>
                    <input className="field" style={{ flex: 1 }} placeholder="AI가 나를 부르는 이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    {(['all', 'korean', 'western'] as const).map(c => (
                      <button key={c} type="button"
                        className={`btn ${nameCat === c ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 9, padding: '3px 5px', flexShrink: 0 }}
                        onClick={() => setNameCat(c)}
                      >{c === 'all' ? '전체' : c === 'korean' ? '한국' : '서양'}</button>
                    ))}
                    <button type="button" className="btn ghost" style={{ fontSize: 10, padding: '4px 8px', flexShrink: 0 }} onClick={() => {
                      const pool = nameCat === 'all' ? namePool : namePool.filter(n => n.category === nameCat)
                      if (pool.length > 0) {
                        const picked = pool[Math.floor(Math.random() * pool.length)]
                        setForm(f => ({ ...f, name: picked.name, ...(picked.gender ? { gender: picked.gender } : {}) }))
                      } else {
                        setForm(f => ({ ...f, name: RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] }))
                      }
                    }}>🎲</button>
                  </div>
                </div>
                <div>
                  <label className="label">성별</label>
                  <div className="hstack" style={{ gap: 6 }}>
                    {['', '남성', '여성', '기타'].map(g => (
                      <label key={g} className="hstack" style={{ gap: 3, cursor: 'pointer', fontSize: 11 }}>
                        <input type="radio" name="gender" value={g} checked={form.gender === g} onChange={() => setForm(f => ({ ...f, gender: g }))} />
                        {g || '미설정'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label className="label">추가 정보</label>
                  <input className="field" placeholder="직업, 관계 등" value={form.additionalInfo} onChange={e => setForm(f => ({ ...f, additionalInfo: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">설명</label>
                <textarea className="field" rows={2} placeholder="외모, 성격, 배경 등을 자유롭게 적어주세요" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="hstack" style={{ gap: 6 }}>
                <button className="btn primary" onClick={handleSave} disabled={loading}>{loading ? '...' : '저장'}</button>
                <button className="btn ghost" onClick={() => { setCreating(false); setEditingId(null) }}>취소</button>
              </div>
            </div>
          </div>
        )}

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          {personas.map(p => (
            <div key={p.id} className="row" style={{ cursor: 'default' }}>
              <div className="thumb" style={{ background: 'var(--lavender)' }}>
                <PixelAvatar kind="player" size={36} />
              </div>
              <div className="meta">
                <h4>{p.name}{p.gender && <span className="muted" style={{ fontWeight: 400, fontSize: 10 }}> · {p.gender}</span>}</h4>
                <p>{p.description}</p>
                {p.additionalInfo && <p className="tiny muted">{p.additionalInfo}</p>}
              </div>
              <div className="hstack" style={{ flexShrink: 0, gap: 4 }}>
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => openEdit(p)}>편집</button>
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--hot-pink)' }} onClick={() => handleDelete(p.id)}>삭제</button>
              </div>
            </div>
          ))}

          {personas.length === 0 && !isFormOpen && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-soft)' }}>
              <div style={{ fontSize: 28 }}>♡</div>
              <div style={{ marginTop: 8 }}>페르소나가 없어요</div>
              <div className="tiny" style={{ marginTop: 4 }}>위의 <b>새 페르소나</b> 버튼으로 만들어보세요</div>
            </div>
          )}
        </div>
      </div>
    </Win>
  )
}
