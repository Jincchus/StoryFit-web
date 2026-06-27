'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal from '@/components/ui/WhifPersonaModal'
import { createCenterChat, buildPersonaCandidates, type PersonaCandidate, type NewPersonaData } from '@/lib/centerChat'
import NovelText from '@/components/ui/NovelText'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import ChatModeModal from '@/components/ui/ChatModeModal'
import { useDisplayName } from '@/lib/useDisplayName'
import { getOpenings } from '@/lib/openings'
import type { Opening } from '@/types'
import { useRefetchOnForeground } from '@/lib/useRefetchOnForeground'

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  gender?: string
  openingMessage: string; openingMessages?: Opening[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; zetaMeta?: any
}
interface ExistingConv {
  id: string; title: string; updatedAt: string
  messages: { content: string }[]
}

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function ZetaPlotDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [existingConvs, setExistingConvs] = useState<ExistingConv[]>([])
  const [lorebooks, setLorebooks] = useState<any[]>([])
  const [expandedLoreId, setExpandedLoreId] = useState<string | null>(null)
  const [lorebookSectionOpen, setLorebookSectionOpen] = useState(false)
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [chatModeOpen, setChatModeOpen] = useState(false)
  const [pendingAiCharIds, setPendingAiCharIds] = useState<string[] | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [isEditingOpening, setIsEditingOpening] = useState(false)
  const [editContent, setEditContent] = useState('')
  const userName = useDisplayName()
  const [standalone, setStandalone] = useState<PersonaCandidate[]>([])

  useEffect(() => {
    api.get('/api/characters?unassigned=true')
      .then((list: any[]) => setStandalone(list.map((c: any) => ({ id: c.id, name: c.name, gender: c.gender || '', avatarUrl: c.avatarUrl ?? null }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  useEffect(() => {
    if (!col) return
    const main = col.characters.find(c => c.name === col.title) ?? col.characters[0]
    const charId = main?.id
    if (!charId) return
    api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
  }, [col])

  useEffect(() => {
    api.get(`/api/lorebooks?collectionId=${id}`).then(setLorebooks).catch(() => {})
  }, [id])

  useRefetchOnForeground(() => {
    if (isEditingOpening) return
    api.get(`/api/collections/${id}`).then(setCol).catch(() => {})
  })

  const handleDeleteChar = async (charId: string) => {
    if (!confirm('이 캐릭터를 삭제할까요? 캐릭터와 관련된 모든 대화방 기록도 함께 정리됩니다.')) return
    try {
      await api.delete(`/api/characters/${charId}`)
      api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
    } catch (e: any) {
      setError('캐릭터 삭제 실패: ' + e.message)
    }
  }

  const startChat = () => {
    if (col!.characters.length > 1) {
      setChatModeOpen(true)
    } else {
      setPendingAiCharIds(col!.characters[0] ? [col!.characters[0].id] : null)
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

  const handleSaveEdit = async (charId: string, openings: Opening[]) => {
    const target = openings[openingIdx]
    if (!target) return
    setError('')
    try {
      const updatedMessages = openings.map(o => o.id === target.id ? { ...o, content: editContent } : o) as Opening[]
      await api.patch(`/api/characters/${charId}`, { openingMessages: updatedMessages })
      setCol(prev => prev ? { ...prev, characters: prev.characters.map(c => c.id === charId ? { ...c, openingMessages: updatedMessages } : c) } : prev)
      setIsEditingOpening(false)
    } catch (e: any) {
      setError('도입부 수정 실패: ' + e.message)
    }
  }

  if (!col) return <div className="zeta-empty">불러오는 중...</div>

  const meta = col.zetaMeta ?? {}
  const mainChar = col.characters.find(c => c.name === col.title) ?? col.characters[0]
  const aiCharIds = pendingAiCharIds ?? (mainChar ? [mainChar.id] : [])
  const personaCandidates = buildPersonaCandidates({
    collectionChars: col.characters.map(c => ({ id: c.id, name: c.name, gender: c.gender || '', avatarUrl: c.avatarUrl })),
    standaloneCards: standalone,
    aiCharIds,
  })
  const openings: Opening[] = getOpenings(mainChar)
  const chatProfile = Array.isArray(meta.chatProfiles) ? meta.chatProfiles[0] : null
  const personaDefaults = chatProfile
    ? [chatProfile.summary, chatProfile.description].filter(Boolean).join('\n')
    : ''

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
        opening: openings[openingIdx]?.content,
        extras: { ...(col.description ? { scenarioDescription: col.description } : {}) },
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) { setError('채팅방 생성 실패: ' + e.message); setCreating(false) }
  }

  return (
    <>
      {showEdit && (
        <CollectionEditModal
          collection={{ id: col.id, title: col.title, tags: col.tags ?? [], description: col.description ?? '', coverImageUrl: col.coverImageUrl ?? '' }}
          label="플롯"
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
          defaultSettings={personaDefaults}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={handlePersonaSelect}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="zeta-scroll">
          <div className="zeta-cover-wrap">
            {col.coverImageUrl ? <img className="zeta-cover" src={col.coverImageUrl} alt="" /> : <div className="zeta-cover" />}
            <button className="zeta-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="zeta-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: 'var(--z-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {col.title}
                {meta.verified && <span title="인증됨" style={{ color: 'var(--z-accent)', fontSize: 16 }}>✓</span>}
              </h1>
              <button className="zeta-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--z-surface-2)', flexShrink: 0 }} onClick={() => setShowEdit(true)}>✏ 정보 수정</button>
            </div>
            {meta.shortDescription && <p style={{ color: 'var(--z-ink-soft)', margin: '0 0 10px', fontSize: 14 }}>{meta.shortDescription}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="zeta-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {col.characters.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 className="zeta-section-title" style={{ margin: 0 }}>캐릭터</h2>
                <button className="zeta-chip" style={{ border: '1px solid var(--z-line)', background: 'var(--z-surface-2)', cursor: 'pointer' }}
                  onClick={() => router.push(`/characters/new?isZeta=true&collectionId=${col.id}`)}>
                  + 직접 캐릭터 등록
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.characters.map(c => (
                  <div key={c.id} className="zeta-charcard" style={{ alignItems: 'flex-start', position: 'relative' }}>
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--z-line)', flexShrink: 0 }} />}
                    <div style={{ minWidth: 0, flex: 1, marginLeft: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="zeta-chip" style={{ border: 'none', cursor: 'pointer', padding: '1px 6px', fontSize: 10 }}
                            onClick={(e) => { e.stopPropagation(); router.push(`/characters/${c.id}/edit?isZeta=true`) }}>✏ 수정</button>
                          <button className="zeta-chip" style={{ border: 'none', cursor: 'pointer', padding: '1px 6px', fontSize: 10, color: '#ff6b8a' }}
                            onClick={(e) => { e.stopPropagation(); handleDeleteChar(c.id) }}>✕ 삭제</button>
                        </div>
                      </div>
                      {c.additionalInfo?.trim() && (
                        <div style={{ color: 'var(--z-ink-soft)', fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {replaceDisplayPlaceholders(c.additionalInfo, userName, c.name)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {col.description?.trim() && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">스토리</h2>
              <div className="zeta-intro-box">
                <NovelText text={replaceDisplayPlaceholders(col.description ?? '', userName, mainChar?.name ?? '')} />
              </div>
            </div>
          )}

          {openings.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">인트로</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                {openings.map((op, i) => (
                  <button key={op.id} className="zeta-chip"
                    style={{ border: 'none', cursor: 'pointer', background: i === openingIdx ? 'var(--z-accent)' : 'var(--z-surface-2)', color: i === openingIdx ? '#fff' : 'var(--z-ink-soft)' }}
                    onClick={() => { setOpeningIdx(i); setIsEditingOpening(false) }}>{op.title}</button>
                ))}
                {!isEditingOpening && (
                  <button className="zeta-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--z-surface-2)', marginLeft: 'auto' }}
                    onClick={() => { setEditContent(openings[openingIdx]?.content ?? ''); setIsEditingOpening(true) }}>
                    ✏ 편집
                  </button>
                )}
              </div>
              {isEditingOpening ? (
                <div className="vstack" style={{ gap: 8 }}>
                  <textarea className="field" rows={8}
                    style={{ fontSize: 13, background: 'var(--z-surface)', border: '1px solid var(--z-line)', color: 'var(--z-ink)', padding: 10, borderRadius: 10, width: '100%', resize: 'vertical' }}
                    value={editContent} onChange={e => setEditContent(e.target.value)} />
                  <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => mainChar && handleSaveEdit(mainChar.id, openings)}>저장</button>
                    <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setIsEditingOpening(false)}>취소</button>
                  </div>
                </div>
              ) : (
                <div className="zeta-intro-box">
                  <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', userName, mainChar?.name ?? '')} />
                </div>
              )}
            </div>
          )}

          {Array.isArray(meta.conversations) && meta.conversations.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">예시 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {meta.conversations.map((conv: any, i: number) => (
                  <div key={i} className="zeta-intro-box">
                    {(conv.messages ?? []).map((m: any, j: number) => (
                      <div key={j} style={{ marginBottom: j < (conv.messages?.length ?? 0) - 1 ? 10 : 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: 'var(--z-ink)' }}>
                          {m.sender === 'USER' ? userName : (m.senderName || mainChar?.name || '캐릭터')}
                        </div>
                        <NovelText text={replaceDisplayPlaceholders(String(m.content ?? ''), userName, mainChar?.name ?? '')} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}



          {lorebooks.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <button className="acc-toggle" onClick={() => setLorebookSectionOpen(o => !o)}>
                <span className="zeta-section-title" style={{ margin: 0 }}>로어북 ({lorebooks.length})</span>
                <span className={`acc-arrow ${lorebookSectionOpen ? 'open' : ''}`}>▼</span>
              </button>
              {lorebookSectionOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lorebooks.map((lb: any) => {
                  const title = lb.keyword?.[0] || '로어북 항목'
                  const isExpanded = expandedLoreId === lb.id
                  return (
                    <div key={lb.id} className="zeta-charcard" style={{ cursor: 'pointer', flexDirection: 'column', alignItems: 'stretch' }} onClick={() => setExpandedLoreId(isExpanded ? null : lb.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700 }}>📒 {title}</span>
                        <span style={{ fontSize: 11, color: 'var(--z-ink-soft)' }}>{isExpanded ? '접기 ▲' : '펼치기 ▼'}</span>
                      </div>
                      {lb.keyword && lb.keyword.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {lb.keyword.slice(1).map((k: string) => (
                            <span key={k} style={{ fontSize: 9, background: 'var(--z-surface-2)', color: 'var(--z-ink-soft)', padding: '1px 6px', borderRadius: 4 }}>{k}</span>
                          ))}
                        </div>
                      )}
                      {isExpanded && (
                        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--z-ink-soft)', whiteSpace: 'pre-wrap', borderTop: '1px solid var(--z-line)', paddingTop: 8, lineHeight: 1.5 }}>
                          <NovelText text={replaceDisplayPlaceholders(lb.content, userName, mainChar?.name ?? '')} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          )}

          {existingConvs.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="zeta-charcard" style={{ cursor: 'pointer', justifyContent: 'space-between' }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--z-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--z-ink-soft)', fontSize: 11, flexShrink: 0 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="zeta-cta">
          <button className="zeta-cta-btn" onClick={handleCtaClick} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
