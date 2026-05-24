'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface TagEntry { id: string; name: string }
interface CharacterTagEntry { id: string; name: string; category: string; gender: string }

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

  const [characterTags, setCharacterTags] = useState<CharacterTagEntry[]>([])
  const [ctForm, setCtForm] = useState({ name: '', category: '성격', gender: '공통' })
  const [ctBulkInput, setCtBulkInput] = useState('')
  const [showCtBulk, setShowCtBulk] = useState(false)
  const [ctError, setCtError] = useState('')

  useEffect(() => {
    api.get('/api/admin/tags').then(setTags).catch(() => {})
    api.get('/api/admin/character-tags').then(setCharacterTags).catch(() => {})
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

  const handleCtAdd = async () => {
    const name = ctForm.name.trim()
    if (!name) return
    setCtError('')
    try {
      const created = await api.post('/api/admin/character-tags', ctForm)
      setCharacterTags(prev => [...prev, created])
      setCtForm(f => ({ ...f, name: '' }))
    } catch (e: any) { setCtError(e.message) }
  }

  const handleCtBulkAdd = async () => {
    const lines = ctBulkInput.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return
    setCtError('')
    let skipped = 0
    for (const name of lines) {
      try {
        const created = await api.post('/api/admin/character-tags', { ...ctForm, name })
        setCharacterTags(prev => [...prev, created])
      } catch { skipped++ }
    }
    setCtBulkInput('')
    setShowCtBulk(false)
    if (skipped > 0) setCtError(`${skipped}개는 중복이어서 건너뜀`)
  }

  const handleCtDelete = async (id: string) => {
    await api.delete(`/api/admin/character-tags/${id}`)
    setCharacterTags(prev => prev.filter(t => t.id !== id))
  }

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
                {(() => {
                  const q = input.trim()
                  const shown = q ? tags.filter(t => t.name.includes(q)) : tags
                  return (
                    <>
                      <div className="tiny muted">총 {tags.length}개{q ? ` (${shown.length}개 표시)` : ''}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {shown.map(t => (
                          <div key={t.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: q && t.name === q ? 'var(--lavender)' : 'var(--pane)', border: `1px solid ${q && t.name === q ? 'var(--hot-pink)' : 'var(--chrome-border)'}`, fontSize: 11 }}>
                            <span>{t.name}</span>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }} onClick={() => handleDelete(t.id)}>×</button>
                          </div>
                        ))}
                        {tags.length === 0 && <div className="tiny muted">태그가 없습니다.</div>}
                        {tags.length > 0 && shown.length === 0 && <div className="tiny muted">일치하는 태그 없음</div>}
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            {tab === 'character' && (
              <div className="vstack" style={{ gap: 8 }}>
                <div className="tiny muted">캐릭터 폼에서 관계/성격/외모/역할 칩으로 표시됩니다.</div>

                <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <input
                    className="field" style={{ flex: 1, minWidth: 100 }}
                    placeholder="태그 이름"
                    value={ctForm.name}
                    onChange={e => setCtForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleCtAdd() }}
                  />
                  <select className="field" style={{ width: 72, fontSize: 11 }} value={ctForm.category} onChange={e => setCtForm(f => ({ ...f, category: e.target.value }))}>
                    {CHAR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="field" style={{ width: 60, fontSize: 11 }} value={ctForm.gender} onChange={e => setCtForm(f => ({ ...f, gender: e.target.value }))}>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <button className="btn primary" onClick={handleCtAdd}>추가</button>
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowCtBulk(s => !s)}>일괄</button>
                </div>

                {showCtBulk && (
                  <div className="vstack" style={{ gap: 6, padding: 8, background: 'var(--pane)', border: '1px solid var(--chrome-border)' }}>
                    <div className="tiny muted">현재 선택: <b>{ctForm.category} / {ctForm.gender}</b></div>
                    <textarea className="field" rows={6} placeholder={"태그를 한 줄에 하나씩\n예:\n햇살녀\n냉정남\n대형견남"} value={ctBulkInput} onChange={e => setCtBulkInput(e.target.value)} />
                    <div className="hstack" style={{ gap: 4 }}>
                      <button className="btn primary" style={{ fontSize: 10 }} onClick={handleCtBulkAdd}>일괄 추가</button>
                      <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setShowCtBulk(false)}>취소</button>
                    </div>
                  </div>
                )}

                {ctError && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {ctError}</div>}

                {(() => {
                  const q = ctForm.name.trim()
                  const shown = q ? characterTags.filter(t => t.name.includes(q)) : characterTags
                  return (
                    <>
                      {CHAR_CATEGORIES.map(cat => {
                        const catTags = shown.filter(t => t.category === cat)
                        const totalCat = characterTags.filter(t => t.category === cat)
                        if (totalCat.length === 0) return null
                        return (
                          <div key={cat} className="vstack" style={{ gap: 4 }}>
                            <div className="tiny muted" style={{ fontWeight: 700 }}>{cat} ({catTags.length}{q ? `/${totalCat.length}` : ''})</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {catTags.map(t => (
                                <div key={t.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: q && t.name === q ? 'var(--lavender)' : 'var(--pane)', border: `1px solid ${q && t.name === q ? 'var(--hot-pink)' : 'var(--chrome-border)'}`, fontSize: 11, borderRadius: 'var(--radius)' }}>
                                  <span style={{ fontSize: 9, color: GENDER_COLOR[t.gender] ?? 'var(--ink-soft)', fontWeight: 700 }}>{t.gender}</span>
                                  <span>{t.name}</span>
                                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }} onClick={() => handleCtDelete(t.id)}>×</button>
                                </div>
                              ))}
                              {catTags.length === 0 && q && <div className="tiny muted">일치 없음</div>}
                            </div>
                          </div>
                        )
                      })}
                      {characterTags.length === 0 && <div className="tiny muted">태그가 없습니다. 위에서 추가하세요.</div>}
                    </>
                  )
                })()}
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
                {(() => {
                  const q = statInput.trim()
                  const shown = q ? statTags.filter(t => t.name.includes(q)) : statTags
                  return (
                    <>
                      <div className="tiny muted">총 {statTags.length}개{q ? ` (${shown.length}개 표시)` : ''}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {shown.map(t => (
                          <div key={t.id} className="hstack" style={{ gap: 4, padding: '3px 8px', background: q && t.name === q ? 'var(--lavender)' : 'var(--pane)', border: `1px solid ${q && t.name === q ? 'var(--hot-pink)' : 'var(--chrome-border)'}`, fontSize: 11 }}>
                            <span>{t.name}</span>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b8a', padding: 0, fontSize: 11 }}
                              onClick={() => api.delete(`/api/admin/stat-tags/${t.id}`).then(() => setStatTags(prev => prev.filter(s => s.id !== t.id))).catch(() => {})}
                            >×</button>
                          </div>
                        ))}
                        {statTags.length === 0 && <div className="tiny muted">스탯 태그가 없습니다.</div>}
                        {statTags.length > 0 && shown.length === 0 && <div className="tiny muted">일치하는 태그 없음</div>}
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

          </div>
        </div>
      </div>
    </Win>
  )
}
