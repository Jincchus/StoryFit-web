'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { fixJosa } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'
import MeltingMarkdown from '@/components/ui/MeltingMarkdown'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { getOpenings } from '@/lib/openings'
import type { Opening } from '@/types'

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; openingMessages?: Opening[]; tags: string[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; meltingMeta?: any
}

export default function MeltingCharDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [generatingOpening, setGeneratingOpening] = useState(false)
  const [error, setError] = useState('')
  const [existingConvs, setExistingConvs] = useState<any[]>([])
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

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
    if (existingConvs.length > 0) {
      setShowNewChatConfirm(true)
    } else {
      setPersonaOpen(true)
    }
  }

  if (!col) return <div className="melting-empty">불러오는 중...</div>

  const meta = col.meltingMeta ?? {}
  const mainChar = col.characters[0]
  const tagline = meta.publicTagline ?? col.description ?? ''
  const openings = getOpenings(mainChar)
  const opening = openings[openingIdx]?.content ?? ''

  const parsedUserSettings = meta.userSettings || (() => {
    const match = mainChar?.additionalInfo?.match(/\[유저 기본 설정\]\n([\s\S]*?)(?:\n\n\[|$)/)
    return match ? match[1].trim() : ''
  })()

  const handleGenerateOpening = async () => {
    if (!mainChar) return
    const target = openings[openingIdx]
    if (!target) return
    setGeneratingOpening(true); setError('')
    try {
      const { openingMessages } = await api.post(`/api/characters/${mainChar.id}/openings/generate`, { openingId: target.id })
      setCol(prev => prev ? {
        ...prev,
        characters: prev.characters.map(c => c.id === mainChar.id ? { ...c, openingMessages } : c),
      } : prev)
    } catch (e: any) {
      setError('도입부 생성 실패: ' + e.message)
    } finally {
      setGeneratingOpening(false)
    }
  }

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
      {showEdit && (
        <CollectionEditModal
          collection={{ id: col.id, title: col.title, tags: col.tags ?? [], description: col.description ?? '', coverImageUrl: col.coverImageUrl ?? '' }}
          label="캐릭터"
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
          defaultSettings={parsedUserSettings}
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
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--m-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</h1>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="melting-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--m-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setShowEdit(true)}>✏ 정보</button>
                    {mainChar && (
                      <button className="melting-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--m-surface-2)', padding: '4px 8px', fontSize: 11 }}
                        onClick={() => router.push(`/characters/${mainChar.id}/edit?isMelting=true`)}>✏ 캐릭터</button>
                    )}
                  </div>
                </div>
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
              <MeltingMarkdown text={fixJosa(mainChar.additionalInfo
                .replace(/\{\{user\}\}/gi, '나')
                .replace(/\{\{char\}\}/gi, mainChar.name)
                .replace(/\{유저\}/g, '나')
                .replace(/\{캐릭터\}/g, mainChar.name), ['나', mainChar.name])} />
            </div>
          )}

          {openings.length > 0 && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">첫 장면</h2>
              {openings.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                  {openings.map((op, i) => (
                    <button key={op.id} className={`melting-chip ${i === openingIdx ? 'sel' : ''}`}
                      style={{ border: 'none', cursor: 'pointer' }} onClick={() => setOpeningIdx(i)}>
                      {op.title}
                    </button>
                  ))}
                  {openingIdx !== 0 && (
                    <button className="melting-chip" disabled={generatingOpening}
                      style={{ border: 'none', cursor: generatingOpening ? 'default' : 'pointer', background: 'var(--m-accent)', color: '#fff', marginLeft: 'auto' }}
                      onClick={handleGenerateOpening}>
                      {generatingOpening ? '생성 중...' : '✨ AI로 이어쓰기'}
                    </button>
                  )}
                </div>
              )}
              <div className="melting-intro-box">
                <NovelText text={fixJosa(opening
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')
                  .replace(/\{유저\}/g, '나')
                  .replace(/\{캐릭터\}/g, mainChar?.name ?? ''), ['나', mainChar?.name])} />
              </div>
            </div>
          )}

          {existingConvs.length > 0 && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="melting-card" style={{ cursor: 'pointer', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--m-surface)', border: '1px solid var(--w-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--m-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--m-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--m-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="melting-cta">
          <button className="melting-cta-btn" onClick={handleCtaClick} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
