'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { getOpenings } from '@/lib/openings'
import { useRefetchOnForeground } from '@/lib/useRefetchOnForeground'
import { useDisplayName } from '@/lib/useDisplayName'
import type { Opening } from '@/types'

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; openingMessages?: Opening[]; tags: string[]
}
interface Col {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]
}

export default function TingleCharDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Col | null>(null)
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const userName = useDisplayName()

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  useRefetchOnForeground(() => {
    api.get(`/api/collections/${id}`).then(f => { if (f) setCol(f) }).catch(() => {})
  })

  if (!col) return <div className="tingle-empty">불러오는 중...</div>

  const mainChar = col.characters[0]
  const openings = getOpenings(mainChar)
  const opening = openings[openingIdx]?.content ?? ''

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
        ...(opening.trim() ? { openingMessage: opening } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  const charNames = col.characters.map(c => c.name)

  return (
    <>
      {showEdit && (
        <CollectionEditModal
          collection={{ id: col.id, title: col.title, tags: col.tags ?? [], description: col.description ?? '', coverImageUrl: col.coverImageUrl ?? '' }}
          label="캐릭터"
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <img className="tingle-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="tingle-avatar" style={{ background: 'var(--tg-line)' }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--tg-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</h1>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setShowEdit(true)}>✏ 정보</button>
                    {mainChar && (
                      <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                        onClick={() => router.push(`/characters/${mainChar.id}/edit`)}>✏ 캐릭터</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--tg-accent)', fontWeight: 700 }}>캐릭터</div>
              </div>
            </div>
            {col.description?.trim() && (
              <p className="tingle-desc" style={{ marginBottom: 10 }}>
                {replaceDisplayPlaceholders(col.description, userName, charNames)}
              </p>
            )}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tingle-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {mainChar?.additionalInfo?.trim() && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">상세 설정</h2>
              <div className="tingle-desc">
                {replaceDisplayPlaceholders(mainChar.additionalInfo, userName, charNames)}
              </div>
            </div>
          )}

          {openings.length > 0 && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">도입부</h2>
              {openings.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {openings.map((o, i) => (
                    <button key={o.id} className="tingle-chip"
                      style={{ border: 'none', cursor: 'pointer', background: openingIdx === i ? 'var(--tg-accent)' : 'var(--tg-surface-2)', color: openingIdx === i ? '#fff' : 'var(--tg-ink-soft)' }}
                      onClick={() => setOpeningIdx(i)}>{o.title || `도입부 ${i + 1}`}</button>
                  ))}
                </div>
              )}
              <div className="tingle-intro-box">
                <NovelText text={replaceDisplayPlaceholders(opening, userName, charNames)} />
              </div>
            </div>
          )}

          {error && <div style={{ padding: '0 16px 8px', fontSize: 12, color: '#ff6b8a' }}>{error}</div>}
          <div style={{ height: 80 }} />
        </div>

        <div className="tingle-cta">
          <button className="tingle-cta-btn" disabled={creating} onClick={() => setPersonaOpen(true)}>
            {creating ? '생성 중...' : '대화 시작'}
          </button>
        </div>
      </div>
    </>
  )
}
