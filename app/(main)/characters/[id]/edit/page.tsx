'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'

export default function CharacterEditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [error, setError] = useState('')
  const [charName, setCharName] = useState('')
  const [collectionId, setCollectionId] = useState<string>('')
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    Promise.all([
      api.get(`/api/characters/${id}`),
      api.get('/api/collections'),
    ]).then(([c, cols]) => {
      setCharName(c.name ?? '')
      setCollectionId(c.collection?.id ?? '')
      setCollections(Array.isArray(cols) ? cols : [])
    }).catch((e: any) => setFetchError(e.message))
  }, [id])

  if (fetchError) return (
    <Win title="캐릭터 수정" icon={PixelIcons.user}>
      <div className="tiny" style={{ color: '#ff6b8a', padding: 20 }}>⚠ {fetchError}</div>
    </Win>
  )

  const handleSubmit = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await api.patch(`/api/characters/${id}`, { collectionId: collectionId || null })
      router.push('/characters')
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <Win title="캐릭터 수정 (Edit Character)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>캐릭터 수정</div>
            <div className="tiny muted">{charName}</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 6 }}>
            <button className="btn ghost" onClick={() => router.back()}>← 취소</button>
            {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
            <button className="btn primary" disabled={loading} onClick={handleSubmit}>
              {loading ? '저장 중...' : '✦ 저장'}
            </button>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">채팅방 카테고리 <span className="tiny muted">(선택)</span></div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>같은 작품·시리즈 캐릭터끼리 묶어서 관리합니다.</div>
          <select
            className="field"
            value={collectionId}
            onChange={e => setCollectionId(e.target.value)}
          >
            <option value="">미분류</option>
            {collections.map(col => (
              <option key={col.id} value={col.id}>{col.title}</option>
            ))}
          </select>
        </div>
      </div>
    </Win>
  )
}
