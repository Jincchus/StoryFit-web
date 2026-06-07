'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import CharacterForm, { type CharFormData } from '@/components/ui/CharacterForm'

export default function CharacterEditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState<CharFormData | null>(null)
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    Promise.all([
      api.get(`/api/characters/${id}`),
      api.get('/api/collections'),
    ]).then(([c, cols]) => {
      setForm({
        name: c.name ?? '',
        gender: c.gender ?? '',
        avatarUrl: c.avatarUrl ?? '',
        tags: c.tags ?? [],
        additionalInfo: c.additionalInfo ?? '',
        exampleDialogues: c.exampleDialogues ?? '',
        openingMessage: c.openingMessage ?? '',
        collectionId: c.collection?.id ?? null,
      })
      setCollections(Array.isArray(cols) ? cols : [])
    }).catch((e: any) => setFetchError(e.message))
  }, [id])

  if (fetchError) return (
    <Win title="캐릭터 수정" icon={PixelIcons.user}>
      <div className="tiny" style={{ color: '#ff6b8a', padding: 20 }}>⚠ {fetchError}</div>
    </Win>
  )
  if (!form) return (
    <Win title="캐릭터 수정" icon={PixelIcons.user}>
      <div className="tiny muted" style={{ padding: 20 }}>불러오는 중...</div>
    </Win>
  )

  const onChange = <K extends keyof CharFormData>(key: K, val: CharFormData[K]) =>
    setForm(f => f ? { ...f, [key]: val } : f)

  const handleSubmit = async () => {
    if (!form.name.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      await api.patch(`/api/characters/${id}`, form)
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
            <div className="tiny muted">{form.name}</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 6, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => router.back()}>← 취소</button>
            {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
            <button
              className="btn primary"
              disabled={loading || !form.name.trim()}
              onClick={handleSubmit}
            >{loading ? '저장 중...' : '✦ 저장'}</button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, paddingRight: 4 }}>
          <CharacterForm form={form} onChange={onChange} collections={collections} />
        </div>
      </div>
    </Win>
  )
}
