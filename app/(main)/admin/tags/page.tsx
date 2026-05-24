'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface TagEntry { id: string; name: string }
interface PersonaTagEntry { id: string; name: string; category: string; gender: string; scope: string }

const CHAR_CATEGORIES = ['관계', '성격', '외모', '역할'] as const
const GENDERS = ['공통', '남', '여'] as const
const GENDER_COLOR: Record<string, string> = { 공통: 'var(--ink-soft)', 남: '#6b9eff', 여: '#ff9eb5' }

export default function AdminTagsPage() {
  const [tab, setTab] = useState<'world' | 'character' | 'stat'>('world')

  const [tags, setTags] = useState<TagEntry[]>([])
  const [input, setInput] = useState('')
  const [bulkInput, setBulkInput] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [error, setError] = useState('')

  const [statTags, setStatTags] = useState<TagEntry[]>([])
  const [statInput, setStatInput] = useState('')
  const [statError, setStatError] = useState('')

  const [personaTags, setPersonaTags] = useState<PersonaTagEntry[]>([])
  const [ptForm, setPtForm] = useState({ name: '', category: '성격', gender: '공통', scope: 'character' })
  const [ptBulkInput, setPtBulkInput] = useState('')
  const [showPtBulk, setShowPtBulk] = useState(false)
  const [ptError, setPtError] = useState('')

  useEffect(() => {
    api.get('/api/admin/tags').then(setTags).catch(() => {})
    api.get('/api/admin/persona-tags').then(setPersonaTags).catch(() => {})
    api.get('/api/admin/stat-tags').then(setStatTags).catch(() => {})
  }, [])

  const handleAdd = async () => {
    const name = input.trim()
    if (!name) return
    setError('')
    try {
      const created = await api.post('/api/admin/tags', { name })
      setTags(prev => [...prev, created])
      setInput('')
    } catch (e: any) { setError(e.message) }
  }

  const handleBulkAdd = async () => {
    const lines = bulkInput.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return
    setError('')
    let skipped = 0
    for (const name of lines) {
      try {
        const created = await api.post('/api/admin/tags', { name })
        setTags(prev => [...prev, created])
      } catch { skipped++ }
    }
    setBulkInput('')
    setShowBulk(false)
    if (skipped > 0) setError(`${skipped}개는 중복이어서 건너뜀`)
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/api/admin/tags/${id}`)
    setTags(prev => prev.filter(t => t.id !== id))
  }

  const handlePtAdd = async () => {
    const name = ptForm.name.trim()
    if (!name) return
    setPtError('')
    try {
      const created = await api.post('/api/admin/persona-tags', ptForm)
      setPersonaTags(prev => [...prev, created])
      setPtForm(f => ({ ...f, name: '' }))
    } catch (e: any) { setPtError(e.message) }
  }

  const handlePtBulkAdd = async () => {
    const lines = ptBulkInput.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return
    setPtError('')
    let skipped = 0
    for (const name of lines) {
      try {
        const created = await api.post('/api/admin/persona-tags', { ...ptForm, name })
        setPersonaTags(prev => [...prev, created])
      } catch { skipped++ }
    }
    setPtBulkInput('')
    setShowPtBulk(false)
    if (skipped > 0) setPtError(`${skipped}개는 중복이어서 건너뜀`)
  }

  const handlePtDelete = async (id: string) => {
    await api.delete(`/api/admin/persona-tags/${id}`)
    setPersonaTags(prev => prev.filter(t => t.id !== id))
  }

  const scopedTags = personaTags.filter(t => t.scope === 'character')

  return (
    <Win title="관리자 — 태그 관리" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 0, flex: 1, minHeight: 0 }}>
        <div style={{ padding: 4, paddingBottom: 0 }}>
          <AdminNav current="/admin/tags" />
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 4 }}>
          <div className="vstack" style={{ gap: 12 }}>

            {/* 탭 */}
            <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
              {(['world', 'character', 'stat'] as const).map(t => (
                <button
                  key={t}
                  className={`btn ${tab === t ? 'primary' : 'ghost'}`}
                  style={{ fontSize: 11 }}
                  onClick={() => setTab(t)}
                >{t === 'world' ? '세계관 태그' : t === 'character' ? '캐릭터 태그' : '스탯 태그'}</button>
              ))}
            </div>

            {tab === 'world' && (
              <div className="vstack" style={{ gap: 8 }}>
                <div className="tiny muted">캐릭터 선택 화면에서 세계관 필터링에 사용됩니다.</div>
                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <input
                    className="field" style={{ flex: 1, minWidth: 120 }}
                    placeholder="태그 이름 입력"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                  />
                  <button className="btn primary" onClick={handleAdd}>추가</button>
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowBulk(s => !s)}>일괄</button>
                </div>
                {showBulk && (
                  <div className="vstack" style={{ gap: 6, padding: 8, background: 'var(--pane)', border: '1px solid var(--chrome-border)' }}>
                    <textarea className="field" rows={6} placeholder={"태그를 한 줄에 하나씩\n예:\n판타지\nSF\n로맨스"} value={bulkInput} onChange={e => setBulkInput(e.target.value)} />
                    <div className="hstack" style={{ gap: 4 }}>
                      <button className="btn primary" style={{ fontSize: 10 }} onClick={handleBulkAdd}>일괄 추가</button>
                      <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowBulk(false)}>취소</button>
                    </div>
                  </div>
                )}
                {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
                <div className="tiny muted">총 {tags.length}개</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tags.map(t => (
                    <div key={t.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', fontSize: 11 }}>
                      <span>{t.name}</span>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }} onClick={() => handleDelete(t.id)}>×</button>
                    </div>
                  ))}
                  {tags.length === 0 && <div className="tiny muted">태그가 없습니다.</div>}
                </div>
              </div>
            )}

            {tab === 'character' && (
              <div className="vstack" style={{ gap: 8 }}>
                <div className="tiny muted">캐릭터 폼에서 관계/성격/외모/역할 칩으로 표시됩니다.</div>

                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <input
                    className="field" style={{ flex: 1, minWidth: 100 }}
                    placeholder="태그 이름"
                    value={ptForm.name}
                    onChange={e => setPtForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handlePtAdd() }}
                  />
                  <select className="field" style={{ width: 72, fontSize: 11 }} value={ptForm.category} onChange={e => setPtForm(f => ({ ...f, category: e.target.value }))}>
                    {CHAR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="field" style={{ width: 60, fontSize: 11 }} value={ptForm.gender} onChange={e => setPtForm(f => ({ ...f, gender: e.target.value }))}>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <button className="btn primary" onClick={handlePtAdd}>추가</button>
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowPtBulk(s => !s)}>일괄</button>
                </div>

                {showPtBulk && (
                  <div className="vstack" style={{ gap: 6, padding: 8, background: 'var(--pane)', border: '1px solid var(--chrome-border)' }}>
                    <div className="tiny muted">현재 선택: <b>{ptForm.category} / {ptForm.gender}</b></div>
                    <textarea className="field" rows={6} placeholder={"태그를 한 줄에 하나씩\n예:\n햇살녀\n냉정남\n대형견남"} value={ptBulkInput} onChange={e => setPtBulkInput(e.target.value)} />
                    <div className="hstack" style={{ gap: 4 }}>
                      <button className="btn primary" style={{ fontSize: 10 }} onClick={handlePtBulkAdd}>일괄 추가</button>
                      <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowPtBulk(false)}>취소</button>
                    </div>
                  </div>
                )}

                {ptError && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {ptError}</div>}

                {CHAR_CATEGORIES.map(cat => {
                  const catTags = scopedTags.filter(t => t.category === cat)
                  if (catTags.length === 0) return null
                  return (
                    <div key={cat} className="vstack" style={{ gap: 4 }}>
                      <div className="tiny muted" style={{ fontWeight: 700 }}>{cat} ({catTags.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {catTags.map(t => (
                          <div key={t.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', fontSize: 11, borderRadius: 'var(--radius)' }}>
                            <span style={{ fontSize: 9, color: GENDER_COLOR[t.gender] ?? 'var(--ink-soft)', fontWeight: 700 }}>{t.gender}</span>
                            <span>{t.name}</span>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }} onClick={() => handlePtDelete(t.id)}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {scopedTags.length === 0 && <div className="tiny muted">태그가 없습니다. 위에서 추가하세요.</div>}
              </div>
            )}

            {tab === 'stat' && (
              <div className="vstack" style={{ gap: 8 }}>
                <div className="tiny muted">스토리 모드에서 관계·능력치 스탯으로 사용됩니다. 예: 호감도, 힘, 지력, HP</div>
                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <input
                    className="field" style={{ flex: 1, minWidth: 120 }}
                    placeholder="스탯 이름 입력 (예: 호감도, 힘)"
                    value={statInput}
                    onChange={e => setStatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const name = statInput.trim()
                        if (!name) return
                        setStatError('')
                        api.post('/api/admin/stat-tags', { name })
                          .then(created => { setStatTags(prev => [...prev, created]); setStatInput('') })
                          .catch((e: any) => setStatError(e.message))
                      }
                    }}
                  />
                  <button className="btn primary" onClick={() => {
                    const name = statInput.trim()
                    if (!name) return
                    setStatError('')
                    api.post('/api/admin/stat-tags', { name })
                      .then(created => { setStatTags(prev => [...prev, created]); setStatInput('') })
                      .catch((e: any) => setStatError(e.message))
                  }}>추가</button>
                </div>
                {statError && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {statError}</div>}
                <div className="tiny muted">총 {statTags.length}개</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {statTags.map(t => (
                    <div key={t.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', fontSize: 11 }}>
                      <span>{t.name}</span>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }}
                        onClick={() => api.delete(`/api/admin/stat-tags/${t.id}`).then(() => setStatTags(prev => prev.filter(s => s.id !== t.id))).catch(() => {})}
                      >×</button>
                    </div>
                  ))}
                  {statTags.length === 0 && <div className="tiny muted">스탯 태그가 없습니다.</div>}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </Win>
  )
}
