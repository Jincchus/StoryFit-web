'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { useDisplayName } from '@/lib/useDisplayName'

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; tags: string[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; tikitaMeta?: any
}

export default function TikitaStoryDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [existingConvs, setExistingConvs] = useState<any[]>([])
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const userName = useDisplayName()

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  useEffect(() => {
    const charId = col?.characters?.[0]?.id
    if (charId) {
      api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
    }
  }, [col])

  const handleCtaClick = () => {
    if (existingConvs.length > 0) setShowNewChatConfirm(true)
    else setPersonaOpen(true)
  }

  if (!col) return <div className="tikita-empty">불러오는 중...</div>

  const meta = col.tikitaMeta ?? {}
  const mainChar = col.characters[0]
  const tagline = meta.tagline ?? col.description ?? ''
  const opening = mainChar?.openingMessage ?? ''

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
        suggestRepliesEnabled: true,
        ...(col.description ? { scenarioDescription: col.description } : {}),
        ...(opening.trim() ? { openingMessage: opening } : {}),
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
          label="스토리"
          onClose={() => setShowEdit(false)}
          onSaved={u => setCol(prev => prev ? { ...prev, ...u } : prev)}
        />
      )}

      {showNewChatConfirm && (
        <ConfirmDialog
          message="이미 진행 중인 대화방이 있습니다. 새로운 대화방을 만드시겠습니까? (기존 대화방은 하단의 진행 중인 대화 목록에서 이어갈 수 있습니다.)"
          confirmLabel="새 대화 시작"
          confirmVariant="primary"
          onConfirm={() => { setShowNewChatConfirm(false); setPersonaOpen(true) }}
          onCancel={() => setShowNewChatConfirm(false)}
        />
      )}

      {personaOpen && (
        <WhifPersonaModal
          candidates={[]}
          loading={creating}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="tikita-scroll">
          <div className="tikita-cover-wrap">
            {col.coverImageUrl ? <img className="tikita-cover" src={col.coverImageUrl} alt="" /> : <div className="tikita-cover" />}
            <button className="tikita-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="tikita-section">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <img className="tikita-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="tikita-avatar" style={{ background: 'var(--t-line)' }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--t-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</h1>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="tikita-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--t-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setShowEdit(true)}>✏ 정보</button>
                    {mainChar && (
                      <button className="tikita-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--t-surface-2)', padding: '4px 8px', fontSize: 11 }}
                        onClick={() => router.push(`/characters/${mainChar.id}/edit?isTikita=true`)}>✏ 캐릭터</button>
                    )}
                  </div>
                </div>
                {meta.isAdult && <span className="tikita-chip" style={{ background: 'var(--t-accent)', color: '#fff' }}>성인</span>}
              </div>
            </div>
            {tagline && <p className="tikita-desc" style={{ marginBottom: 10 }}>{tagline}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tikita-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {mainChar?.additionalInfo?.trim() && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">상세 설정</h2>
              <div className="tikita-intro-box">
                <NovelText text={replaceDisplayPlaceholders(mainChar.additionalInfo, userName, mainChar.name)} />
              </div>
            </div>
          )}

          {opening.trim() && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">첫 장면</h2>
              <div className="tikita-intro-box">
                <NovelText text={replaceDisplayPlaceholders(opening, userName, mainChar?.name ?? '')} />
              </div>
            </div>
          )}

          {existingConvs.length > 0 && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="tikita-card" style={{ cursor: 'pointer', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--t-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--t-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="tikita-cta">
          <button className="tikita-cta-btn" onClick={handleCtaClick} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
