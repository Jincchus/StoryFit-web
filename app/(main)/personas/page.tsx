'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import type { UserPersona } from '@/types'

export default function PersonasPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const { personas } = state
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', additionalInfo: '' })

  const openCreate = () => { setForm({ name: '', description: '', additionalInfo: '' }); setCreating(true); setEditingId(null) }
  const openEdit = (p: UserPersona) => { setForm({ name: p.name, description: p.description, additionalInfo: p.additionalInfo }); setEditingId(p.id); setCreating(false) }

  const handleSave = () => {
    if (!form.name.trim()) return
    if (creating) {
      dispatch({ type: 'addPersona', persona: { id: 'persona-' + Date.now(), ...form } })
    } else if (editingId) {
      dispatch({ type: 'editPersona', id: editingId, patch: { ...form } })
    }
    setCreating(false); setEditingId(null)
  }

  const isFormOpen = creating || !!editingId

  return (
    <Win title="내 페르소나 (My Persona)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
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
                  <input className="field" placeholder="AI가 나를 부르는 이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
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
                <button className="btn primary" onClick={handleSave}>저장</button>
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
                <h4>{p.name}</h4>
                <p>{p.description}</p>
                {p.additionalInfo && <p className="tiny muted">{p.additionalInfo}</p>}
              </div>
              <div className="hstack" style={{ flexShrink: 0, gap: 4 }}>
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => openEdit(p)}>편집</button>
                <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--hot-pink)' }} onClick={() => dispatch({ type: 'deletePersona', id: p.id })}>삭제</button>
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
