'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
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
  characters: Char[]
}

export default function LoveydoveyCharDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [existingConvs, setExistingConvs] = useState<any[]>([])
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [isEditingOpening, setIsEditingOpening] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [userDisplayName, setUserDisplayName] = useState('나')

  useEffect(() => {
    api.get('/api/user/settings')
      .then((data: any) => {
        if (data.displayName) setUserDisplayName(data.displayName)
      })
      .catch(() => {})
  }, [])

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

  if (!col) return <div className="lovey-empty">불러오는 중...</div>

  const mainChar = col.characters[0]
  const tagline = col.description ?? ''
  const openings = getOpenings(mainChar)
  const opening = openings[openingIdx]?.content ?? ''
  const hasOpening = openings.some(o => o.content?.trim())

  const handleSaveEdit = async () => {
    if (!mainChar || !col) return
    const target = openings[openingIdx]
    if (!target) return
    setError('')
    try {
      const updatedMessages = openings.map(o => o.id === target.id ? { ...o, content: editContent } : o) as Opening[]
      await api.patch(`/api/characters/${mainChar.id}`, { openingMessages: updatedMessages })
      setCol(prev => prev ? {
        ...prev,
        characters: prev.characters.map(c => c.id === mainChar.id ? { ...c, openingMessages: updatedMessages } : c),
      } : prev)
      setIsEditingOpening(false)
    } catch (e: any) {
      setError('도입부 수정 실패: ' + e.message)
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
          defaultSettings=""
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="lovey-scroll">
          <div className="lovey-cover-wrap">
            {col.coverImageUrl ? <img className="lovey-cover" src={col.coverImageUrl} alt="" /> : <div className="lovey-cover" />}
            <button className="lovey-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="lovey-section">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <img className="lovey-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="lovey-avatar" style={{ background: 'var(--l-line)' }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--l-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</h1>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="lovey-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--l-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setShowEdit(true)}>✏ 정보</button>
                    {mainChar && (
                      <button className="lovey-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--l-surface-2)', padding: '4px 8px', fontSize: 11 }}
                        onClick={() => router.push(`/characters/${mainChar.id}/edit?isLoveydovey=true`)}>✏ 캐릭터</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {tagline && <p className="lovey-desc" style={{ marginBottom: 10 }}>{replaceDisplayPlaceholders(tagline, userDisplayName, mainChar?.name ?? '')}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="lovey-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {mainChar?.additionalInfo?.trim() && (
            <div className="lovey-section" style={{ paddingTop: 0 }}>
              <h2 className="lovey-section-title">상세 설정</h2>
              <MeltingMarkdown text={replaceDisplayPlaceholders(mainChar.additionalInfo, userDisplayName, mainChar.name)} />
            </div>
          )}

          <div className="lovey-section" style={{ paddingTop: 0 }}>
            <h2 className="lovey-section-title">첫 장면</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              {openings.map((op, i) => (
                <button key={op.id} className={`lovey-chip ${i === openingIdx ? 'sel' : ''}`}
                  style={{ border: 'none', cursor: 'pointer' }} onClick={() => { setOpeningIdx(i); setIsEditingOpening(false) }}>
                  {op.title}
                </button>
              ))}
              {!isEditingOpening && (
                <button className="lovey-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--l-surface-2)', marginLeft: 'auto' }}
                  onClick={() => { setEditContent(opening); setIsEditingOpening(true) }}>
                  ✏ 편집
                </button>
              )}
            </div>

            {isEditingOpening ? (
              <div className="vstack" style={{ gap: 8 }}>
                <textarea
                  className="field"
                  style={{ fontSize: 13, background: 'var(--l-surface)', border: '1px solid var(--l-line)', color: 'var(--l-ink)', padding: 10, borderRadius: 10, width: '100%', resize: 'vertical' }}
                  rows={8}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                />
                <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={handleSaveEdit}>저장</button>
                  <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setIsEditingOpening(false)}>취소</button>
                </div>
              </div>
            ) : hasOpening ? (
              <div className="lovey-intro-box">
                <NovelText text={replaceDisplayPlaceholders(opening, userDisplayName, mainChar?.name ?? '')} />
              </div>
            ) : (
              <div className="lovey-intro-box" style={{ color: 'var(--l-ink-soft)' }}>
                loveydovey는 도입부를 제공하지 않습니다. ✏ 편집으로 첫 장면을 직접 작성하세요.
              </div>
            )}
          </div>

          {existingConvs.length > 0 && (
            <div className="lovey-section" style={{ paddingTop: 0 }}>
              <h2 className="lovey-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="lovey-card" style={{ cursor: 'pointer', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--l-surface)', border: '1px solid var(--l-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--l-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--l-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--l-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="lovey-cta">
          <button className="lovey-cta-btn" onClick={handleCtaClick} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
