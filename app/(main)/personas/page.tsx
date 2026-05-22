'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { RANDOM_NAMES } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Toast from '@/components/ui/Toast'

type NameEntry = { name: string; category: string; gender: string }
interface PersonaTagEntry { id: string; name: string; category: string; gender: string }

interface Persona {
  id: string
  name: string
  gender: string
  description: string
  additionalInfo: string
  tags: string[]
}

const CATEGORIES = ['관계', '성격', '외모'] as const
type Category = typeof CATEGORIES[number]

function visibleTags(tags: PersonaTagEntry[], category: Category, gender: string): PersonaTagEntry[] {
  return tags.filter(t => {
    if (t.category !== category) return false
    if (!gender || gender === '기타') return true
    return t.gender === '공통' || t.gender === (gender === '남성' ? '남' : '여')
  })
}

export default function PersonasPage() {
  const router = useRouter()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', gender: '', description: '', additionalInfo: '', tags: [] as string[] })
  const [loading, setLoading] = useState(false)
  const [namePool, setNamePool] = useState<NameEntry[]>([])
  const [nameCat, setNameCat] = useState<'all' | 'korean' | 'western'>('all')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [personaTags, setPersonaTags] = useState<PersonaTagEntry[]>([])
  const [customInputs, setCustomInputs] = useState<Record<Category, string>>({ 관계: '', 성격: '', 외모: '' })
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get('/api/personas').then(setPersonas).catch(() => {})
    fetch('/api/names').then(r => r.json()).then(setNamePool).catch(() => {})
    api.get('/api/persona-tags').then(setPersonaTags).catch(() => {})
  }, [])

  const scrollToForm = () => setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  const openCreate = () => {
    setForm({ name: '', gender: '', description: '', additionalInfo: '', tags: [] })
    setCustomInputs({ 관계: '', 성격: '', 외모: '' })
    setCreating(true); setEditingId(null); scrollToForm()
  }
  const openEdit = (p: Persona) => {
    setForm({ name: p.name, gender: p.gender ?? '', description: p.description, additionalInfo: p.additionalInfo, tags: p.tags ?? [] })
    setCustomInputs({ 관계: '', 성격: '', 외모: '' })
    setEditingId(p.id); setCreating(false); scrollToForm()
  }

  const toggleTag = (name: string) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(name) ? f.tags.filter(t => t !== name) : [...f.tags, name],
    }))
  }

  const addCustomTag = (cat: Category) => {
    const val = customInputs[cat].trim()
    if (!val || form.tags.includes(val)) return
    setForm(f => ({ ...f, tags: [...f.tags, val] }))
    setCustomInputs(c => ({ ...c, [cat]: '' }))
  }

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
      setToast('저장 완료')
    } catch {} finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/api/personas/${id}`)
    setPersonas(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
  }

  const isFormOpen = creating || !!editingId

  return (
    <>
    {toast && <Toast message={toast} onDone={() => setToast('')} />}
    {confirmDeleteId && (
      <ConfirmDialog
        message="이 페르소나를 삭제할까요?"
        onConfirm={() => handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    )}
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
          <div ref={formRef} className="win" style={{ flexShrink: 0 }}>
            <div className="win-title">
              <div className="win-title-l"><span>{creating ? '새 페르소나 만들기' : '페르소나 편집'}</span></div>
              <div className="win-controls"><button onClick={() => { setCreating(false); setEditingId(null) }}>×</button></div>
            </div>
            <div className="win-body vstack" style={{ gap: 10 }}>

              {/* 이름 + 성별 */}
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

              {/* 태그 섹션 */}
              {CATEGORIES.map(cat => {
                const available = visibleTags(personaTags, cat, form.gender)
                return (
                  <div key={cat}>
                    <label className="label">{cat}</label>
                    <div style={{ overflowX: 'auto', paddingBottom: 4, marginBottom: 5 }}>
                      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 5, width: 'max-content' }}>
                        {available.map(t => {
                          const selected = form.tags.includes(t.name)
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleTag(t.name)}
                              style={{
                                padding: '3px 9px', fontSize: 11, borderRadius: 20,
                                border: `1.5px solid ${selected ? 'var(--hot-pink)' : 'var(--chrome-border)'}`,
                                background: selected ? 'var(--hot-pink)' : 'var(--chrome-face)',
                                color: selected ? '#fff' : 'var(--ink)',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >{t.name}</button>
                          )
                        })}
                        {available.length === 0 && <div className="tiny muted">등록된 태그가 없습니다.</div>}
                      </div>
                    </div>
                    <div className="hstack" style={{ gap: 4 }}>
                      <input
                        className="field" style={{ flex: 1, fontSize: 11 }}
                        placeholder={`${cat} 직접 입력 후 Enter`}
                        value={customInputs[cat]}
                        onChange={e => setCustomInputs(c => ({ ...c, [cat]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(cat) } }}
                      />
                      <button className="btn ghost" style={{ fontSize: 10, padding: '2px 7px' }} onClick={() => addCustomTag(cat)}>추가</button>
                    </div>
                  </div>
                )
              })}

              {/* 선택된 태그 전체 표시 */}
              {form.tags.length > 0 && (
                <div>
                  <label className="label">선택된 태그</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {form.tags.map(t => (
                      <span
                        key={t}
                        style={{ padding: '2px 8px', fontSize: 11, borderRadius: 20, background: 'var(--lavender)', border: '1px solid var(--chrome-border)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 12, lineHeight: 1 }}
                        >×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 추가 정보 (자유 텍스트) */}
              <div>
                <label className="label">추가 정보</label>
                <input className="field" placeholder="태그 외 추가로 적고 싶은 내용" value={form.additionalInfo} onChange={e => setForm(f => ({ ...f, additionalInfo: e.target.value }))} />
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
                {p.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '2px 0' }}>
                    {p.tags.map(t => (
                      <span key={t} style={{ padding: '1px 6px', fontSize: 10, borderRadius: 10, background: 'var(--lavender)', border: '1px solid var(--chrome-border)' }}>{t}</span>
                    ))}
                  </div>
                )}
                {p.additionalInfo && <p className="tiny muted">{p.additionalInfo}</p>}
              </div>
              <div className="hstack" style={{ flexShrink: 0, gap: 4 }}>
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => openEdit(p)}>편집</button>
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--hot-pink)' }} onClick={() => setConfirmDeleteId(p.id)}>삭제</button>
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
    </>
  )
}
