'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import ZoomableImage from '@/components/ui/ZoomableImage'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal from '@/components/ui/WhifPersonaModal'
import { createCenterChat, buildPersonaCandidates, type PersonaCandidate, type NewPersonaData } from '@/lib/centerChat'
import ChatModeModal from '@/components/ui/ChatModeModal'
import NovelText from '@/components/ui/NovelText'
import MeltingMarkdown from '@/components/ui/MeltingMarkdown'
import ImageCarousel from '@/components/ui/ImageCarousel'
import SecretSettingsBlock from '@/components/ui/SecretSettingsBlock'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { getOpenings } from '@/lib/openings'
import { splitRofanSections, splitByRule } from '@/lib/rofanSections'
import MappedCharacters from '@/components/ui/MappedCharacters'
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
  characters: Char[]
}

export default function RofanCharDetailPage() {
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

  useEffect(() => {
    const charId = col?.characters?.[0]?.id
    if (charId) {
      api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
    }
  }, [col])

  useRefetchOnForeground(() => {
    if (isEditingOpening) return
    api.get(`/api/collections/${id}`).then(setCol).catch(() => {})
  })

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

  if (!col) return <div className="rofan-empty">불러오는 중...</div>

  const mainChar = col.characters[0]
  const aiCharIds = pendingAiCharIds ?? (mainChar ? [mainChar.id] : [])
  const tagline = col.description ?? ''
  const openings = getOpenings(mainChar)
  const opening = openings[openingIdx]?.content ?? ''
  const personaCandidates = buildPersonaCandidates({
    collectionChars: col.characters.map(c => ({ id: c.id, name: c.name, gender: '', avatarUrl: c.avatarUrl })),
    standaloneCards: standalone,
    aiCharIds,
  })

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

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData, flip = false) => {
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
          defaultSettings=""
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={handlePersonaSelect}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="rofan-scroll">
          <div className="rofan-cover-wrap">
            {col.coverImageUrl ? <ZoomableImage className="rofan-cover" src={col.coverImageUrl} alt="" /> : <div className="rofan-cover" />}
            <button className="rofan-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="rofan-section">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <ZoomableImage className="rofan-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="rofan-avatar" style={{ background: 'var(--r-line)' }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--r-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</h1>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="rofan-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--r-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setShowEdit(true)}>✏ 정보</button>
                    {mainChar && (
                      <button className="rofan-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--r-surface-2)', padding: '4px 8px', fontSize: 11 }}
                        onClick={() => router.push(`/characters/${mainChar.id}/edit?isRofan=true`)}>✏ 캐릭터</button>
                    )}
                    <button className="rofan-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--r-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => router.push(`/characters/new?isRofan=true&collectionId=${col.id}`)}>+ 캐릭터 등록</button>
                  </div>
                </div>
              </div>
            </div>
            {tagline && <p className="rofan-desc" style={{ marginBottom: 10 }}>{replaceDisplayPlaceholders(tagline, userDisplayName, mainChar?.name ?? '')}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="rofan-chip">#{t}</span>)}
              </div>
            )}
          </div>

          <MappedCharacters characters={col.characters} prefix="r" personaName={userDisplayName} />

          {mainChar?.additionalInfo?.trim() && splitRofanSections(mainChar.additionalInfo, '캐릭터 소개').map((sec, i) => {
            // 우측 상단 배지: 이 섹션 내용이 실제로 어디로 들어가는지 표시(캐릭터 설정/세계관 상세설명만).
            const dest = sec.title === '캐릭터 소개' ? '캐릭터 설정' : sec.title === '세계관' ? '세계관 상세설명' : null
            return (
              <div key={`${sec.title}-${i}`} className="rofan-section" style={{ paddingTop: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <h2 className="rofan-section-title" style={{ margin: 0 }}>{sec.title}</h2>
                  {dest && <span className="rofan-chip" style={{ fontWeight: 700, flexShrink: 0 }}>{dest}</span>}
                </div>
                {/* --- 구분선이 있으면 조각별로 카드를 나눠 보여준다(표시 전용, 데이터는 그대로) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {splitByRule(sec.body).map((part, j) => (
                    <div key={j} className="rofan-intro-box">
                      <MeltingMarkdown text={replaceDisplayPlaceholders(part, userDisplayName, mainChar.name)} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {mainChar && (
            <SecretSettingsBlock
              className="rofan-section"
              characterId={mainChar.id}
              value={mainChar.secretSettings ?? ''}
              userName={userDisplayName}
              charNames={col.characters.map(c => c.name)}
              enablePaste
              onSaved={next => setCol(c => c ? { ...c, characters: c.characters.map(ch => ch.id === mainChar.id ? { ...ch, secretSettings: next } : ch) } : c)}
            />
          )}

          {Array.isArray(mainChar?.relatedImages) && mainChar.relatedImages.length > 0 && (
            <div className="rofan-section" style={{ paddingTop: 0 }}>
              <h2 className="rofan-section-title">이미지 ({mainChar.relatedImages.length})</h2>
              <ImageCarousel images={mainChar.relatedImages} accent="var(--r-accent)" line="var(--r-line)" />
            </div>
          )}

          <div className="rofan-section" style={{ paddingTop: 0 }}>
            <h2 className="rofan-section-title">첫 장면</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              {openings.map((op, i) => (
                <button key={op.id} className={`rofan-chip ${i === openingIdx ? 'sel' : ''}`}
                  style={{ border: 'none', cursor: 'pointer' }} onClick={() => { setOpeningIdx(i); setIsEditingOpening(false) }}>
                  {op.title}
                </button>
              ))}
              {!isEditingOpening && (
                <button className="rofan-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--r-surface-2)', marginLeft: 'auto' }}
                  onClick={() => { setEditContent(opening); setIsEditingOpening(true) }}>
                  ✏ 편집
                </button>
              )}
            </div>

            {isEditingOpening ? (
              <div className="vstack" style={{ gap: 8 }}>
                <textarea
                  className="field"
                  style={{ fontSize: 13, background: 'var(--r-surface)', border: '1px solid var(--r-line)', color: 'var(--r-ink)', padding: 10, borderRadius: 10, width: '100%', resize: 'vertical' }}
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
              <div className="rofan-intro-box">
                <NovelText text={replaceDisplayPlaceholders(opening, userDisplayName, mainChar?.name ?? '')} />
              </div>
            )}
          </div>

          {existingConvs.length > 0 && (
            <div className="rofan-section" style={{ paddingTop: 0 }}>
              <h2 className="rofan-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="rofan-card" style={{ cursor: 'pointer', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--r-surface)', border: '1px solid var(--r-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--r-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--r-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--r-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="rofan-cta">
          <button className="rofan-cta-btn" onClick={handleCtaClick} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
