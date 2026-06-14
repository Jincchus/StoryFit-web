'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

export interface CollectionEditData {
  id: string
  title: string
  tags: string[]
  description: string
  coverImageUrl: string
}

export default function CollectionEditModal({ collection, label, onClose, onSaved }: {
  collection: CollectionEditData
  label: string
  onClose: () => void
  onSaved: (updated: CollectionEditData) => void
}) {
  const [title, setTitle] = useState(collection.title)
  const [tags, setTags] = useState(collection.tags.join(', '))
  const [description, setDescription] = useState(collection.description ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(collection.coverImageUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!title.trim()) { setError('이름을 입력하세요.'); return }
    setSaving(true); setError('')
    const payload = {
      title: title.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      description,
      coverImageUrl: coverImageUrl.trim(),
    }
    try {
      await api.patch(`/api/collections/${collection.id}`, payload)
      onSaved({ id: collection.id, ...payload })
      onClose()
    } catch (e: any) {
      setError(e.message ?? '저장에 실패했습니다.')
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--chrome-face)', border: '1px solid var(--accent)', borderRadius: 10, padding: 20, width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{label} 정보 수정</div>
          <button className="btn ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={onClose}>✕</button>
        </div>

        <div className="vstack" style={{ gap: 10 }}>
          <div className="vstack" style={{ gap: 4 }}>
            <div className="label">제목</div>
            <input className="field" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div className="vstack" style={{ gap: 4 }}>
            <div className="label">태그 <span className="tiny muted">(쉼표로 구분)</span></div>
            <input className="field" value={tags} onChange={e => setTags(e.target.value)} placeholder="예: 아포칼립스, 냉미남, 군인" />
          </div>
          <div className="vstack" style={{ gap: 4 }}>
            <div className="label">내용 / 설명</div>
            <textarea className="field" rows={6} value={description} onChange={e => setDescription(e.target.value)} style={{ whiteSpace: 'pre-wrap' }} />
          </div>
          <div className="vstack" style={{ gap: 4 }}>
            <div className="label">커버 이미지 URL</div>
            <input className="field" value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
        </div>

        <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
