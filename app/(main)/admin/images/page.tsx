'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface ImageRow {
  id: string
  filename: string
  isShared: boolean
  uploaderId: string | null
  createdAt: string
}

export default function AdminImagesPage() {
  const [images, setImages] = useState<ImageRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/images').then(setImages).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const toggleShared = async (img: ImageRow) => {
    try {
      const updated = await api.patch(`/api/admin/images/${img.id}`, { isShared: !img.isShared })
      setImages(prev => prev.map(i => i.id === img.id ? { ...i, ...updated } : i))
    } catch (e: any) { alert(e.message) }
  }

  const remove = async (img: ImageRow) => {
    if (!confirm(`"${img.filename}" 을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    try {
      await api.delete(`/api/admin/images/${img.id}`)
      setImages(prev => prev.filter(i => i.id !== img.id))
    } catch (e: any) { alert(e.message) }
  }

  return (
    <Win title="관리자 — 이미지 관리" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/images" />
        <div className="tiny muted">총 {images.length}개</div>

        {loading ? (
          <div className="tiny muted" style={{ padding: 20 }}>불러오는 중...</div>
        ) : images.length === 0 ? (
          <div className="tiny muted" style={{ padding: 20 }}>업로드된 이미지가 없습니다.</div>
        ) : (
          <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {images.map(img => (
                <div
                  key={img.id}
                  style={{
                    border: '1px solid var(--chrome-border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    background: 'var(--pane)',
                    opacity: img.isShared ? 1 : 0.5,
                  }}
                >
                  <div style={{ width: '100%', aspectRatio: '1', background: 'var(--win-bg)', overflow: 'hidden' }}>
                    <img
                      src={`/api/uploads/${img.filename}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      alt=""
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                  <div style={{ padding: '6px 6px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9 }}>
                      {img.filename}
                    </div>
                    <div className="hstack" style={{ gap: 4 }}>
                      <button
                        className={`btn ${img.isShared ? 'ghost' : 'primary'}`}
                        style={{ fontSize: 9, padding: '1px 5px', flex: 1 }}
                        onClick={() => toggleShared(img)}
                      >
                        {img.isShared ? '공개' : '비공개'}
                      </button>
                      <button
                        className="btn danger"
                        style={{ fontSize: 9, padding: '1px 5px' }}
                        onClick={() => remove(img)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Win>
  )
}
