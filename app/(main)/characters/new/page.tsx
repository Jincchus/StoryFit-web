'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import CharacterForm, { type CharFormData } from '@/components/ui/CharacterForm'

function CharacterNewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const collectionIdParam = searchParams.get('collectionId') ?? ''
  const isWhifParam = searchParams.get('isWhif') === 'true'
  const isZetaParam = searchParams.get('isZeta') === 'true'
  const isMeltingParam = searchParams.get('isMelting') === 'true'
  const isTikitaParam = searchParams.get('isTikita') === 'true'
  const isChubParam = searchParams.get('isChub') === 'true'
  const isRofanParam = searchParams.get('isRofan') === 'true'
  const isLoveydoveyParam = searchParams.get('isLoveydovey') === 'true'
  const isBabechatParam = searchParams.get('isBabechat') === 'true'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([])
  const [form, setForm] = useState<CharFormData>({
    name: '', gender: '', avatarUrl: '',
    tags: [], additionalInfo: '', exampleDialogues: '', openingMessage: '', openingMessages: [],
    collectionId: collectionIdParam || null,
  })

  useEffect(() => {
    let url = '/api/collections'
    if (isWhifParam) url += '?isWhif=true'
    else if (isZetaParam) url += '?isZeta=true'
    else if (isMeltingParam) url += '?isMelting=true'
    else if (isTikitaParam) url += '?isTikita=true'
    else if (isChubParam) url += '?isChub=true'
    else if (isRofanParam) url += '?isRofan=true'
    else if (isLoveydoveyParam) url += '?isLoveydovey=true'
    else if (isBabechatParam) url += '?isBabechat=true'

    api.get(url)
      .then(cols => {
        setCollections(Array.isArray(cols) ? cols : [])
      })
      .catch(() => {})
  }, [isWhifParam, isZetaParam, isMeltingParam, isTikitaParam, isChubParam, isRofanParam, isLoveydoveyParam, isBabechatParam])

  const onChange = <K extends keyof CharFormData>(key: K, val: CharFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.name.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const cleanOpenings = (form.openingMessages ?? []).filter(o => o.content.trim())
      await api.post('/api/characters', {
        ...form,
        openingMessage: cleanOpenings[0]?.content ?? '',
        openingMessages: cleanOpenings.length > 1 ? cleanOpenings : undefined,
      })
      if (isWhifParam) {
        router.push(form.collectionId ? `/whif/universes/${form.collectionId}` : '/whif')
      } else if (isZetaParam) {
        router.push(form.collectionId ? `/zeta/plots/${form.collectionId}` : '/zeta')
      } else if (isMeltingParam) {
        router.push(form.collectionId ? `/melting/characters/${form.collectionId}` : '/melting')
      } else if (isTikitaParam) {
        router.push(form.collectionId ? `/tikita/story/${form.collectionId}` : '/tikita')
      } else if (isChubParam) {
        router.push(form.collectionId ? `/chub/characters/${form.collectionId}` : '/chub')
      } else if (isRofanParam) {
        router.push(form.collectionId ? `/rofan/characters/${form.collectionId}` : '/rofan')
      } else if (isLoveydoveyParam) {
        router.push(form.collectionId ? `/loveydovey/characters/${form.collectionId}` : '/loveydovey')
      } else if (isBabechatParam) {
        router.push(form.collectionId ? `/babechat/characters/${form.collectionId}` : '/babechat')
      } else {
        router.push('/characters')
      }
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  const collectionLabel = isWhifParam ? '세계관' : isZetaParam ? '플롯' : isMeltingParam ? '캐릭터' : isTikitaParam ? '스토리' : isChubParam ? '캐릭터' : isRofanParam ? '캐릭터' : isLoveydoveyParam ? '캐릭터' : isBabechatParam ? '캐릭터' : '컬렉션'

  return (
    <Win title="캐릭터 만들기 (Create Character)" icon={PixelIcons.user}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>커스텀 캐릭터</div>
            <div className="tiny muted">나만의 AI 캐릭터를 만들어보세요</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 6, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => router.back()}>← 취소</button>
            {error && <div className="tiny" style={{ color: '#ff6b8a' }}>⚠ {error}</div>}
            <button
               className="btn primary"
               disabled={loading || !form.name.trim()}
               onClick={handleSubmit}
            >{loading ? '저장 중...' : '✦ 캐릭터 저장'}</button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, paddingRight: 4 }}>
          <CharacterForm form={form} onChange={onChange} collections={collections} collectionLabel={collectionLabel} />
        </div>
      </div>
    </Win>
  )
}

export default function CharacterNewPage() {
  return (
    <Suspense fallback={
      <Win title="캐릭터 만들기 (Create Character)" icon={PixelIcons.user}>
        <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center' }}>
          <div className="tiny muted">로딩 중...</div>
        </div>
      </Win>
    }>
      <CharacterNewContent />
    </Suspense>
  )
}
