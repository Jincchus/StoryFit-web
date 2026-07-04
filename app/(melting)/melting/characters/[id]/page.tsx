'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { fixJosa, replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal from '@/components/ui/WhifPersonaModal'
import { createCenterChat, buildPersonaCandidates, type PersonaCandidate, type NewPersonaData } from '@/lib/centerChat'
import ChatModeModal from '@/components/ui/ChatModeModal'
import NovelText from '@/components/ui/NovelText'
import MeltingMarkdown from '@/components/ui/MeltingMarkdown'
import MappedCharacters from '@/components/ui/MappedCharacters'
import ImageCarousel from '@/components/ui/ImageCarousel'
import SecretSettingsBlock from '@/components/ui/SecretSettingsBlock'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { getOpenings } from '@/lib/openings'
import { useRefetchOnForeground } from '@/lib/useRefetchOnForeground'
import type { Opening } from '@/types'

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string; secretSettings?: string
  openingMessage: string; openingMessages?: Opening[]; tags: string[]; relatedImages?: string[]
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
  const [isEditingOpening, setIsEditingOpening] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [chatModeOpen, setChatModeOpen] = useState(false)
  const [pendingAiCharIds, setPendingAiCharIds] = useState<string[] | null>(null)
  const [standalone, setStandalone] = useState<PersonaCandidate[]>([])
  const [userDisplayName, setUserDisplayName] = useState('나')

  useEffect(() => {
    api.get('/api/characters?unassigned=true')
      .then((list: any[]) => setStandalone(list.map((c: any) => ({ id: c.id, name: c.name, gender: c.gender || '', avatarUrl: c.avatarUrl ?? null }))))
      .catch(() => {})
  }, [])

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

  // 백그라운드 복귀 시: 서버에서 생성·저장된 도입부를 반영하고 멈춘 스피너를 정리한다.
  useRefetchOnForeground(() => {
    if (isEditingOpening) return
    api.get(`/api/collections/${id}`).then((fresh) => { if (fresh) setCol(fresh) }).catch(() => {})
    setGeneratingOpening(false)
  })

  useEffect(() => {
    const charId = col?.characters?.[0]?.id
    if (charId) {
      api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
    }
  }, [col])

  const startChat = () => {
    if (!col) return
    if (col.characters.length > 1) {
      setChatModeOpen(true)
    } else {
      setPendingAiCharIds(col.characters[0] ? [col.characters[0].id] : null)
      setPersonaOpen(true)
    }
  }

  const handleCtaClick = () => {
    if (existingConvs.length > 0) {
      setShowNewChatConfirm(true)
    } else {
      startChat()
    }
  }

  if (!col) return <div className="melting-empty">불러오는 중...</div>

  const meta = col.meltingMeta ?? {}
  const mainChar = col.characters[0]
  const aiCharIds = pendingAiCharIds ?? (mainChar ? [mainChar.id] : [])
  const tagline = meta.publicTagline ?? col.description ?? ''
  const openings = getOpenings(mainChar)
  const opening = openings[openingIdx]?.content ?? ''
  const personaCandidates = buildPersonaCandidates({
    collectionChars: col.characters.map(c => ({ id: c.id, name: c.name, gender: '', avatarUrl: c.avatarUrl })),
    standaloneCards: standalone,
    aiCharIds,
  })

  const parsedUserSettings = meta.userSettings || (() => {
    const match = mainChar?.additionalInfo?.match(/\[유저 기본 설정\]\n([\s\S]*?)(?:\n\n\[|$)/)
    return match ? match[1].trim() : ''
  })()

  const currentOpening = openings[openingIdx]

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

  const handleResetOpening = async () => {
    if (!mainChar || !col) return
    const target = openings[openingIdx]
    if (!target || !target.originalPreview) return
    if (!confirm('생성한 도입부를 지우고 원래 미리보기 상태로 되돌릴까요?')) return
    setError('')
    try {
      const updatedMessages = openings.map(o =>
        o.id === target.id
          ? { ...o, content: target.originalPreview, isGenerated: false }
          : o
      ) as Opening[]
      await api.patch(`/api/characters/${mainChar.id}`, { openingMessages: updatedMessages })
      setCol(prev => prev ? {
        ...prev,
        characters: prev.characters.map(c => c.id === mainChar.id ? { ...c, openingMessages: updatedMessages } : c),
      } : prev)
    } catch (e: any) {
      setError('도입부 초기화 실패: ' + e.message)
    }
  }

  const handleGenerateOpening = async () => {
    if (!mainChar) return
    const target = openings[openingIdx]
    if (!target) return
    setGeneratingOpening(true); setError('')
    try {
      const { openingMessages } = await api.post(`/api/characters/${mainChar.id}/openings/generate`, { openingId: target.id })
      setCol(prev => prev ? {
        ...prev,
        characters: prev.characters.map(c => c.id === mainChar.id ? { ...c, openingMessages: openingMessages as Opening[] } : c),
      } : prev)
    } catch (e: any) {
      setError('도입부 생성 실패: ' + e.message)
    } finally {
      setGeneratingOpening(false)
    }
  }

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData, flip = true) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      const resp = await createCenterChat({
        collectionId: col.id,
        title: col.title,
        aiCharIds,
        personaCharId,
        newPersona,
        flipPlaceholders: flip,
        opening: opening || undefined,
        extras: {},
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) { setError('채팅방 생성 실패: ' + e.message); setCreating(false) }
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
          onConfirm={() => { setShowNewChatConfirm(false); startChat() }}
          onCancel={() => setShowNewChatConfirm(false)}
        />
      )}

      {chatModeOpen && (
        <ChatModeModal
          characters={col.characters.map(c => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl }))}
          onClose={() => setChatModeOpen(false)}
          onPick={(ids) => { setPendingAiCharIds(ids); setChatModeOpen(false); setPersonaOpen(true) }}
        />
      )}

      {personaOpen && (
        <WhifPersonaModal
          candidates={personaCandidates}
          loading={creating}
          defaultSettings={parsedUserSettings}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={handlePersonaSelect}
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

          <div className="melting-section" style={{ paddingTop: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="melting-section-title" style={{ margin: 0 }}>캐릭터</h2>
              <button className="melting-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--m-surface-2)' }}
                onClick={() => router.push(`/characters/new?isMelting=true&collectionId=${col.id}`)}>
                + 캐릭터 등록
              </button>
            </div>
          </div>

          <MappedCharacters characters={col.characters} prefix="m" personaName={userDisplayName} />

          {mainChar?.additionalInfo?.trim() && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">상세 설정</h2>
              <MeltingMarkdown text={replaceDisplayPlaceholders(mainChar.additionalInfo, userDisplayName, mainChar.name)} />
            </div>
          )}

          {mainChar && (
            <SecretSettingsBlock
              className="melting-section"
              characterId={mainChar.id}
              value={mainChar.secretSettings ?? ''}
              userName={userDisplayName}
              charNames={col.characters.map(c => c.name)}
              onSaved={next => setCol(c => c ? { ...c, characters: c.characters.map(ch => ch.id === mainChar.id ? { ...ch, secretSettings: next } : ch) } : c)}
            />
          )}

          {Array.isArray(mainChar?.relatedImages) && mainChar.relatedImages.length > 0 && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">이미지 ({mainChar.relatedImages.length})</h2>
              <ImageCarousel images={mainChar.relatedImages} accent="var(--m-accent)" line="var(--m-line)" />
            </div>
          )}

            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">첫 장면</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                {openings.map((op, i) => (
                  <button key={op.id} className={`melting-chip ${i === openingIdx ? 'sel' : ''}`}
                    style={{ border: 'none', cursor: 'pointer' }} onClick={() => { setOpeningIdx(i); setIsEditingOpening(false) }}>
                    {op.title}
                  </button>
                ))}
                
                {openingIdx !== 0 && currentOpening?.isGenerated !== true && (
                  <button className="melting-chip" disabled={generatingOpening}
                    style={{ border: 'none', cursor: generatingOpening ? 'default' : 'pointer', background: 'var(--m-accent)', color: '#fff', marginLeft: 'auto' }}
                    onClick={handleGenerateOpening}>
                    {generatingOpening ? '생성 중...' : '✨ AI로 이어쓰기'}
                  </button>
                )}

                {currentOpening?.originalPreview && currentOpening?.isGenerated === true && (
                  <button className="melting-chip" style={{ border: 'none', cursor: 'pointer', background: '#ff6b8a', color: '#fff', marginLeft: 'auto' }}
                    onClick={handleResetOpening}>
                    ✕ 지우고 다시 생성
                  </button>
                )}

                {!isEditingOpening && (
                  <button className="melting-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--m-surface-2)', marginLeft: (openingIdx !== 0 && currentOpening?.isGenerated !== true) || (currentOpening?.originalPreview && currentOpening?.isGenerated === true) ? '0' : 'auto' }}
                    onClick={() => { setEditContent(opening); setIsEditingOpening(true) }}>
                    ✏ 편집
                  </button>
                )}
              </div>
              
              {isEditingOpening ? (
                <div className="vstack" style={{ gap: 8 }}>
                  <textarea
                    className="field"
                    style={{ fontSize: 13, background: 'var(--m-surface)', border: '1px solid var(--w-line)', color: 'var(--m-ink)', padding: 10, borderRadius: 10, width: '100%', resize: 'vertical' }}
                    rows={8}
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                  />
                  <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={handleSaveEdit}>저장</button>
                    <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setIsEditingOpening(false)}>취소</button>
                  </div>
                </div>
              ) : (
                <div className="melting-intro-box">
                  <NovelText text={replaceDisplayPlaceholders(opening, userDisplayName, mainChar?.name ?? '')} />
                </div>
              )}
            </div>


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
