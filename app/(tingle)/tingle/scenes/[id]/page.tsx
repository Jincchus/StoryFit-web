'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { useDisplayName } from '@/lib/useDisplayName'

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; tags: string[]
}
interface Col {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]
}

export default function TingleSceneDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Col | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const userName = useDisplayName()

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  if (!col) return <div className="tingle-empty">불러오는 중...</div>

  const mainChar = col.characters[0]
  const charNames = col.characters.map(c => c.name)

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newPersona) {
        const p = await api.post('/api/characters', {
          name: newPersona.name, gender: newPersona.gender, additionalInfo: newPersona.additionalInfo,
          collectionId: col.id,
        })
        personaId = p.id
      }
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'story',
        personaCharacterId: personaId,
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
      {showEdit && (
        <CollectionEditModal
          collection={{ id: col.id, title: col.title, tags: col.tags ?? [], description: col.description ?? '', coverImageUrl: col.coverImageUrl ?? '' }}
          label="테마"
          onClose={() => setShowEdit(false)}
          onSaved={u => setCol(prev => prev ? { ...prev, ...u } : prev)}
        />
      )}
      {personaOpen && (
        <WhifPersonaModal
          candidates={[]}
          loading={creating}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={handlePersonaSelect}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="tingle-scroll">
          <div className="tingle-cover-wrap">
            {col.coverImageUrl
              ? <img className="tingle-cover" src={col.coverImageUrl} alt="" />
              : <div className="tingle-cover" />}
            <button className="tingle-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="tingle-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--tg-ink)' }}>{col.title}</h1>
                <div style={{ fontSize: 11, color: '#06bfd6', fontWeight: 700 }}>테마</div>
              </div>
              <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                onClick={() => setShowEdit(true)}>✏ 정보</button>
            </div>
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tingle-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {mainChar?.additionalInfo?.trim() && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">테마 설명</h2>
              <div className="tingle-intro-box">
                <div className="tingle-desc">
                  {replaceDisplayPlaceholders(mainChar.additionalInfo, userName, charNames)}
                </div>
              </div>
            </div>
          )}

          {error && <div style={{ padding: '0 16px 8px', fontSize: 12, color: '#ff6b8a' }}>{error}</div>}
          <div style={{ height: 80 }} />
        </div>

        <div className="tingle-cta">
          <button className="tingle-cta-btn" disabled={creating || !mainChar} onClick={() => setPersonaOpen(true)}>
            {creating ? '생성 중...' : '대화 시작'}
          </button>
        </div>
      </div>
    </>
  )
}
