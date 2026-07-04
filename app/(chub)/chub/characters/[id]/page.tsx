'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal from '@/components/ui/WhifPersonaModal'
import { createCenterChat, buildPersonaCandidates, type PersonaCandidate, type NewPersonaData } from '@/lib/centerChat'
import ChatModeModal from '@/components/ui/ChatModeModal'
import NovelText from '@/components/ui/NovelText'
import MeltingMarkdown from '@/components/ui/MeltingMarkdown'
import MappedCharacters from '@/components/ui/MappedCharacters'
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
  openingMessage: string; openingMessages?: Opening[]; tags: string[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]
  chubMeta?: { activeLang?: 'en' | 'ko'; alt?: unknown } | null
}

export default function ChubCharDetailPage() {
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
  const [translating, setTranslating] = useState(false)

  const handleTranslate = async () => {
    if (translating) return
    const before = col?.chubMeta?.activeLang ?? 'en'
    setTranslating(true); setError('')
    try {
      const updated = await api.post(`/api/collections/${id}/translate`, {})
      setCol(updated)
      setOpeningIdx(0); setIsEditingOpening(false)
    } catch {
      // 백그라운드 등으로 응답을 못 받았어도 서버는 번역을 끝내고 저장했을 수 있다 → 재조회로 복구
      try {
        const fresh = await api.get(`/api/collections/${id}`)
        if ((fresh?.chubMeta?.activeLang ?? 'en') !== before) {
          setCol(fresh); setOpeningIdx(0); setIsEditingOpening(false)
        } else {
          setError('번역 실패: 잠시 후 다시 시도해주세요.')
        }
      } catch {
        setError('번역 실패: 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setTranslating(false)
    }
  }

  // 백그라운드 복귀 시: 저장된 번역 결과를 반영하고 멈춘 스피너를 정리한다.
  useRefetchOnForeground(() => {
    if (isEditingOpening) return // 도입부 편집 중이면 사용자 입력 보존
    api.get(`/api/collections/${id}`).then((fresh) => { if (fresh) setCol(fresh) }).catch(() => {})
    setTranslating(false)
  })

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

  if (!col) return <div className="chub-empty">불러오는 중...</div>

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
          defaultSettings=""
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={handlePersonaSelect}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="chub-scroll">
          <div className="chub-cover-wrap">
            {col.coverImageUrl ? <img className="chub-cover" src={col.coverImageUrl} alt="" /> : <div className="chub-cover" />}
            <button className="chub-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="chub-section">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <img className="chub-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="chub-avatar" style={{ background: 'var(--c-line)' }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</h1>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="chub-chip" disabled={translating}
                      style={{ border: 'none', cursor: translating ? 'default' : 'pointer', background: 'var(--c-accent)', color: '#fff', padding: '4px 8px', fontSize: 11 }}
                      onClick={handleTranslate}>
                      {translating ? '번역 중...' : (col.chubMeta?.activeLang === 'ko' ? '🔤 원문' : '🌐 한국어로 번역')}
                    </button>
                    <button className="chub-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--c-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setShowEdit(true)}>✏ 정보</button>
                    {mainChar && (
                      <button className="chub-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--c-surface-2)', padding: '4px 8px', fontSize: 11 }}
                        onClick={() => router.push(`/characters/${mainChar.id}/edit?isChub=true`)}>✏ 캐릭터</button>
                    )}
                    <button className="chub-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--c-surface-2)', padding: '4px 8px', fontSize: 11 }}
                      onClick={() => router.push(`/characters/new?isChub=true&collectionId=${col.id}`)}>+ 캐릭터 등록</button>
                  </div>
                </div>
              </div>
            </div>
            {tagline && <p className="chub-desc" style={{ marginBottom: 10 }}>{replaceDisplayPlaceholders(tagline, userDisplayName, mainChar?.name ?? '')}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="chub-chip">#{t}</span>)}
              </div>
            )}
          </div>

          <MappedCharacters characters={col.characters} prefix="c" personaName={userDisplayName} />

          {mainChar?.additionalInfo?.trim() && (
            <div className="chub-section" style={{ paddingTop: 0 }}>
              <h2 className="chub-section-title">상세 설정</h2>
              <MeltingMarkdown text={replaceDisplayPlaceholders(mainChar.additionalInfo, userDisplayName, mainChar.name)} />
            </div>
          )}

          {mainChar && (
            <SecretSettingsBlock
              className="chub-section"
              characterId={mainChar.id}
              value={mainChar.secretSettings ?? ''}
              userName={userDisplayName}
              charNames={col.characters.map(c => c.name)}
              onSaved={next => setCol(c => c ? { ...c, characters: c.characters.map(ch => ch.id === mainChar.id ? { ...ch, secretSettings: next } : ch) } : c)}
            />
          )}

          <div className="chub-section" style={{ paddingTop: 0 }}>
            <h2 className="chub-section-title">첫 장면</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              {openings.map((op, i) => (
                <button key={op.id} className={`chub-chip ${i === openingIdx ? 'sel' : ''}`}
                  style={{ border: 'none', cursor: 'pointer' }} onClick={() => { setOpeningIdx(i); setIsEditingOpening(false) }}>
                  {op.title}
                </button>
              ))}
              {!isEditingOpening && (
                <button className="chub-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--c-surface-2)', marginLeft: 'auto' }}
                  onClick={() => { setEditContent(opening); setIsEditingOpening(true) }}>
                  ✏ 편집
                </button>
              )}
            </div>

            {isEditingOpening ? (
              <div className="vstack" style={{ gap: 8 }}>
                <textarea
                  className="field"
                  style={{ fontSize: 13, background: 'var(--c-surface)', border: '1px solid var(--c-line)', color: 'var(--c-ink)', padding: 10, borderRadius: 10, width: '100%', resize: 'vertical' }}
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
              <div className="chub-intro-box">
                <NovelText text={replaceDisplayPlaceholders(opening, userDisplayName, mainChar?.name ?? '')} />
              </div>
            )}
          </div>

          {existingConvs.length > 0 && (
            <div className="chub-section" style={{ paddingTop: 0 }}>
              <h2 className="chub-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="chub-card" style={{ cursor: 'pointer', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--c-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--c-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="chub-cta">
          <button className="chub-cta-btn" onClick={handleCtaClick} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
