'use client'
import { useEffect, useRef, useState } from 'react'

interface SharedImage { id: string; url: string }

interface AvatarPickerProps {
  value: string
  onChange: (url: string) => void
}

export default function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const [sharedImages, setSharedImages] = useState<SharedImage[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/upload').then(r => r.json()).then(setSharedImages).catch(() => {})
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('파일 크기는 10MB 이하여야 합니다')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
    setUploadError('')
  }

  const handleUpload = async () => {
    if (!selectedFile || uploading) return
    setUploading(true)
    setUploadError('')
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('isShared', isShared.toString())
      const res = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '업로드 실패')
      onChange(data.url)
      setSelectedFile(null)
      setPreview('')
      if (isShared) setSharedImages(prev => [...prev, { id: data.id, url: data.url }])
    } catch (e: any) {
      setUploadError(e.message)
      setSelectedFile(null)
      setPreview('')
      if (fileRef.current) fileRef.current.value = ''
    } finally {
      setUploading(false)
    }
  }

  const display = preview || value

  return (
    <div className="vstack" style={{ gap: 10 }}>
      <div className="hstack" style={{ gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 72, height: 72, border: '2px solid var(--chrome-border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--pane)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {display
            ? <img src={display} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            : <span style={{ fontSize: 28, opacity: 0.3 }}>?</span>
          }
        </div>
        <div className="vstack" style={{ gap: 6, flex: 1 }}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleFileSelect} />
          <button type="button" className="btn ghost" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={() => fileRef.current?.click()}>
            📁 파일 선택
          </button>
          {selectedFile && (
            <>
              <div className="tiny muted">{selectedFile.name}</div>
              <label className="hstack" style={{ gap: 6, cursor: 'pointer', fontSize: 11 }}>
                <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
                공유 이미지로 등록 (다른 유저도 사용 가능)
              </label>
              <button type="button" className="btn primary" style={{ fontSize: 11, alignSelf: 'flex-start' }} disabled={uploading} onClick={handleUpload}>
                {uploading ? '업로드 중...' : '⬆ 업로드'}
              </button>
            </>
          )}
          {uploadError && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {uploadError}</div>}
          {value && !selectedFile && <div className="tiny muted" style={{ wordBreak: 'break-all', maxWidth: 200 }}>{value}</div>}
        </div>
      </div>

      {sharedImages.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>공유 이미지</div>
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            {sharedImages.map(img => (
              <div
                key={img.id}
                onClick={() => onChange(img.url)}
                style={{
                  width: 56, height: 56, flexShrink: 0, cursor: 'pointer', overflow: 'hidden',
                  borderRadius: 'var(--radius)',
                  border: value === img.url ? '2px solid var(--hot-pink)' : '2px solid var(--chrome-border)',
                }}
              >
                <img src={img.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
