'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import CharacterForm, { type CharFormData } from '@/components/ui/CharacterForm'

function CharacterEditContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const isWhif = searchParams.get('isWhif') === 'true'
  const isZeta = searchParams.get('isZeta') === 'true'
  const isMelting = searchParams.get('isMelting') === 'true'
  const isTikita = searchParams.get('isTikita') === 'true'
  const isChub = searchParams.get('isChub') === 'true'
  const isRofan = searchParams.get('isRofan') === 'true'
  const isLoveydovey = searchParams.get('isLoveydovey') === 'true'
  const isBabechat = searchParams.get('isBabechat') === 'true'
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState<CharFormData | null>(null)
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    // 캐릭터를 먼저 받아 폼을 즉시 렌더한다(빠름). 컬렉션 목록은 드롭다운용 경량(id·title)으로
    // 별도 비동기 로드 — 무거운 메타/집계 때문에 폼 표시가 지연되지 않게 한다.
    api.get(`/api/characters/${id}`).then((c: any) => {
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
      // 현재 소속 컬렉션은 먼저 단독으로 채워둔다(드롭다운이 비어도 현재 값은 보이게).
      if (c.collection) setCollections([{ id: c.collection.id, title: c.collection.title }])
    }).catch((e: any) => setFetchError(e.message))

    let colsUrl = '/api/collections?fields=basic'
    if (isWhif) colsUrl = '/api/collections?isWhif=true&fields=basic'
    else if (isZeta) colsUrl = '/api/collections?isZeta=true&fields=basic'
    else if (isMelting) colsUrl = '/api/collections?isMelting=true&fields=basic'
    else if (isTikita) colsUrl = '/api/collections?isTikita=true&fields=basic'
    else if (isChub) colsUrl = '/api/collections?isChub=true&fields=basic'
    else if (isRofan) colsUrl = '/api/collections?isRofan=true&fields=basic'
    else if (isLoveydovey) colsUrl = '/api/collections?isLoveydovey=true&fields=basic'
    else if (isBabechat) colsUrl = '/api/collections?isBabechat=true&fields=basic'

    api.get(colsUrl).then((cols: any) => {
      const colList: { id: string; title: string }[] = Array.isArray(cols) ? cols : []
      // 현재 소속 컬렉션이 목록에 없으면 합쳐서 드롭다운에 보이게 한다.
      setCollections(prev => {
        const current = prev[0]
        return current && !colList.some(col => col.id === current.id) ? [...colList, current] : colList
      })
    }).catch(() => {})
  }, [id, isWhif, isZeta, isMelting, isTikita, isChub, isRofan, isLoveydovey, isBabechat])

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
      if (isWhif) {
        router.push(form.collectionId ? `/whif/universes/${form.collectionId}` : '/whif')
      } else if (isZeta) {
        router.push(form.collectionId ? `/zeta/plots/${form.collectionId}` : '/zeta')
      } else if (isMelting) {
        router.push(form.collectionId ? `/melting/characters/${form.collectionId}` : '/melting')
      } else if (isTikita) {
        router.push(form.collectionId ? `/tikita/story/${form.collectionId}` : '/tikita')
      } else if (isChub) {
        router.push(form.collectionId ? `/chub/characters/${form.collectionId}` : '/chub')
      } else if (isRofan) {
        router.push(form.collectionId ? `/rofan/characters/${form.collectionId}` : '/rofan')
      } else if (isLoveydovey) {
        router.push(form.collectionId ? `/loveydovey/characters/${form.collectionId}` : '/loveydovey')
      } else if (isBabechat) {
        router.push(form.collectionId ? `/babechat/characters/${form.collectionId}` : '/babechat')
      } else {
        router.push('/characters')
      }
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  const collectionLabel = isWhif ? '세계관' : isZeta ? '플롯' : isMelting ? '캐릭터' : isTikita ? '스토리' : isChub ? '캐릭터' : isRofan ? '캐릭터' : isLoveydovey ? '캐릭터' : isBabechat ? '캐릭터' : '컬렉션'

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
          <CharacterForm form={form} onChange={onChange} collections={collections} collectionLabel={collectionLabel} />
        </div>
      </div>
    </Win>
  )
}

export default function CharacterEditPage() {
  return (
    <Suspense fallback={
      <Win title="캐릭터 수정 (Edit Character)" icon={PixelIcons.user}>
        <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center' }}>
          <div className="tiny muted">로딩 중...</div>
        </div>
      </Win>
    }>
      <CharacterEditContent />
    </Suspense>
  )
}
