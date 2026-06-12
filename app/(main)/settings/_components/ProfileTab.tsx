'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type PromptPresetMode = 'story' | 'multiStory'

interface PromptPreset {
  id: string
  mode: PromptPresetMode
  name: string
  content: string
  enabled: boolean
  order: number
}

export default function ProfileTab() {
  const [displayName, setDisplayName] = useState('')
  const [adminGlobalRules, setAdminGlobalRules] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [presets, setPresets] = useState<PromptPreset[]>([])
  const [presetsLoading, setPresetsLoading] = useState(false)

  const loadPresets = () => {
    setPresetsLoading(true)
    api.get('/api/user/prompt-presets').then((d: PromptPreset[]) => setPresets(d ?? [])).catch(() => {}).finally(() => setPresetsLoading(false))
  }

  useEffect(() => {
    api.get('/api/user/settings').then((data: any) => {
      setDisplayName(data.displayName ?? '')
      setAdminGlobalRules(data.adminGlobalRules ?? '')
    }).catch(() => {})
    loadPresets()
  }, [])

  const saveProfile = async () => {
    setProfileLoading(true); setProfileSaved(false)
    try {
      await api.patch('/api/user/settings', { displayName })
      setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2000)
    } finally { setProfileLoading(false) }
  }

  const handleAddPreset = async (mode: PromptPresetMode, name: string, content: string) => {
    await api.post('/api/user/prompt-presets', { mode, name, content })
    loadPresets()
  }
  const handleTogglePreset = async (id: string, enabled: boolean) => {
    setPresets(ps => ps.map(p => p.id === id ? { ...p, enabled } : p))
    await api.patch(`/api/user/prompt-presets/${id}`, { enabled }).catch(() => loadPresets())
  }
  const handleEditPreset = async (id: string, data: { name: string; content: string }) => {
    await api.patch(`/api/user/prompt-presets/${id}`, data)
    loadPresets()
  }
  const handleDeletePreset = async (id: string) => {
    if (!confirm('이 프롬프트 프리셋을 삭제할까요?')) return
    await api.delete(`/api/user/prompt-presets/${id}`)
    loadPresets()
  }

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <a href="/guide" className="hstack" style={{ gap: 8, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)', background: 'var(--pane)', textDecoration: 'none', color: 'var(--ink)' }}>
        <span style={{ fontSize: 18 }}>📖</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>기능 가이드</div>
          <div className="tiny muted">슬래시 커맨드, 챕터, 스탯 등 대화를 풍부하게 해주는 기능 모음</div>
        </div>
      </a>
      <div className="vstack" style={{ gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>프로필</div>
        <div>
          <label className="label">표시 이름 <span className="tiny muted">(관리자 페이지 유저 목록에 표시)</span></label>
          <input className="field" placeholder="닉네임 (비워두면 이메일 앞부분 사용)" value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>
        <div className="hstack" style={{ gap: 6 }}>
          <button className="btn primary" disabled={profileLoading} onClick={saveProfile}>{profileLoading ? '저장 중...' : '✦ 저장'}</button>
          {profileSaved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨</span>}
        </div>
      </div>
      {adminGlobalRules.trim() && (
        <div className="vstack" style={{ gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>관리자 공통 규칙 <span className="tiny muted" style={{ fontWeight: 400 }}>(읽기 전용)</span></div>
          <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.05)', border: '1px solid var(--chrome-border)', fontSize: 10, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontFamily: 'var(--font-mono)' }}>{adminGlobalRules}</div>
        </div>
      )}

      <div className="vstack" style={{ gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>모드별 프롬프트 프리셋</div>
        <div className="tiny muted" style={{ lineHeight: 1.6 }}>
          모드별로 여러 개의 프롬프트를 등록해두고 체크박스로 켜고 끌 수 있습니다. 켜둔 프리셋들의 내용이 모두 합쳐져 해당 모드의 시스템 프롬프트에 삽입됩니다 (저장 버튼 없이 즉시 반영됩니다).
        </div>
        {presetsLoading && <div className="tiny muted">불러오는 중...</div>}
        <PromptPresetSection
          mode="story" icon="📖" label="스토리 모드" desc="스토리 대화에만 삽입"
          presets={presets.filter(p => p.mode === 'story')}
          onAdd={handleAddPreset} onToggle={handleTogglePreset} onEdit={handleEditPreset} onDelete={handleDeletePreset}
        />
        <PromptPresetSection
          mode="multiStory" icon="👥" label="멀티스토리 모드" desc="멀티스토리 대화에만 삽입"
          presets={presets.filter(p => p.mode === 'multiStory')}
          onAdd={handleAddPreset} onToggle={handleTogglePreset} onEdit={handleEditPreset} onDelete={handleDeletePreset}
        />
      </div>
    </div>
  )
}

function PromptPresetSection({
  mode, icon, label, desc, presets, onAdd, onToggle, onEdit, onDelete,
}: {
  mode: PromptPresetMode
  icon: string
  label: string
  desc: string
  presets: PromptPreset[]
  onAdd: (mode: PromptPresetMode, name: string, content: string) => Promise<void>
  onToggle: (id: string, enabled: boolean) => void
  onEdit: (id: string, data: { name: string; content: string }) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const submitAdd = async () => {
    if (!newName.trim() || !newContent.trim()) return
    setSaving(true)
    try {
      await onAdd(mode, newName.trim(), newContent.trim())
      setNewName(''); setNewContent(''); setAdding(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="vstack" style={{ gap: 6 }}>
      <div className="spread" style={{ alignItems: 'center' }}>
        <label className="label">{icon} {label} <span className="tiny muted">({desc})</span></label>
        {presets.length < 20 && (
          <button className="btn ghost" style={{ fontSize: 9, padding: '1px 6px' }} onClick={() => setAdding(a => !a)}>
            {adding ? '취소' : '+ 추가'}
          </button>
        )}
      </div>

      {adding && (
        <div className="vstack" style={{ gap: 5, padding: 6, background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
          <input className="field" style={{ fontSize: 10 }} placeholder="프리셋 이름 (예: 반말 톤)" value={newName} onChange={e => setNewName(e.target.value)} />
          <textarea className="field" rows={3} style={{ fontSize: 10 }} placeholder="프롬프트 내용 (예: 응답은 항상 반말로 해주세요.)" value={newContent} onChange={e => setNewContent(e.target.value)} />
          <div className="hstack" style={{ gap: 4 }}>
            <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} disabled={saving || !newName.trim() || !newContent.trim()} onClick={submitAdd}>저장</button>
            <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => { setAdding(false); setNewName(''); setNewContent('') }}>취소</button>
          </div>
        </div>
      )}

      {presets.length === 0 && !adding && (
        <div className="tiny muted" style={{ padding: '6px 2px' }}>등록된 프리셋이 없습니다. 켜둔 프리셋들의 내용이 모두 합쳐져 시스템 프롬프트에 삽입됩니다.</div>
      )}

      {presets.map(p => (
        <div key={p.id} style={{ padding: 6, background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
          {editId === p.id ? (
            <PresetEditForm
              preset={p}
              onSave={async data => { await onEdit(p.id, data); setEditId(null) }}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <>
              <div className="spread" style={{ alignItems: 'center', marginBottom: 2 }}>
                <label className="hstack" style={{ gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={p.enabled} onChange={e => onToggle(p.id, e.target.checked)} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, opacity: p.enabled ? 1 : 0.5 }}>{p.name}</span>
                </label>
                <div className="hstack" style={{ gap: 3 }}>
                  <button className="msg-action-btn" style={{ fontSize: 9 }} onClick={() => setEditId(p.id)}>✏</button>
                  <button className="msg-action-btn danger" style={{ fontSize: 9 }} onClick={() => onDelete(p.id)}>✕</button>
                </div>
              </div>
              <div className="tiny muted" style={{ opacity: p.enabled ? 1 : 0.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.content}</div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function PresetEditForm({ preset, onSave, onCancel }: {
  preset: PromptPreset
  onSave: (data: { name: string; content: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(preset.name)
  const [content, setContent] = useState(preset.content)
  const [saving, setSaving] = useState(false)
  return (
    <div className="vstack" style={{ gap: 5 }}>
      <input className="field" style={{ fontSize: 10 }} value={name} onChange={e => setName(e.target.value)} />
      <textarea className="field" rows={3} style={{ fontSize: 10 }} value={content} onChange={e => setContent(e.target.value)} />
      <div className="hstack" style={{ gap: 4 }}>
        <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} disabled={saving || !name.trim() || !content.trim()}
          onClick={async () => { setSaving(true); try { await onSave({ name: name.trim(), content: content.trim() }) } finally { setSaving(false) } }}>저장</button>
        <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
