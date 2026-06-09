'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; tags: string[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; meltingMeta?: any
}

export default function MeltingCharDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  if (!col) return <div className="melting-empty">불러오는 중...</div>

  const meta = col.meltingMeta ?? {}
  const mainChar = col.characters[0]
  const tagline = meta.publicTagline ?? col.description ?? ''
  const opening = mainChar?.openingMessage ?? ''

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newPersona) {
        const p = await api.post('/api/characters', {
          name: newPersona.name, gender: newPersona.gender, additionalInfo: newPersona.additionalInfo,
        })
        personaId = p.id
      }
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'roleplay',
        personaCharacterId: personaId,
        statsEnabled: true,
        statsConfig: [{ name: '호감도', value: 50, min: 0, max: 100 }],
        suggestRepliesEnabled: true,
        ...(opening.trim() ? { openingMessage: opening } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
      {personaOpen && (
        <WhifPersonaModal
          candidates={[]}
          loading={creating}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="melting-scroll">
          <div className="melting-cover-wrap">
            {col.coverImageUrl ? <img className="melting-cover" src={col.coverImageUrl} alt="" /> : <div className="melting-cover" />}
            <button className="melting-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="melting-section">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <img className="melting-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="melting-avatar" style={{ background: 'var(--m-line)' }} />}
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--m-ink)' }}>{col.title}</h1>
                {meta.nsfw && <span className="melting-chip" style={{ background: 'var(--m-accent)', color: '#fff' }}>NSFW</span>}
              </div>
            </div>
            {tagline && <p className="melting-desc" style={{ marginBottom: 10 }}>{tagline}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="melting-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {mainChar?.additionalInfo?.trim() && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">상세 설정</h2>
              <p className="melting-desc">{mainChar.additionalInfo}</p>
            </div>
          )}

          {opening.trim() && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">첫 장면</h2>
              <div className="melting-intro-box">
                <NovelText text={opening
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="melting-cta">
          <button className="melting-cta-btn" onClick={() => setPersonaOpen(true)} disabled={!mainChar}>대화 시작하기</button>
        </div>
      </div>
    </>
  )
}
