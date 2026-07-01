'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal from '@/components/ui/WhifPersonaModal'
import { createCenterChat, buildPersonaCandidates, type PersonaCandidate, type NewPersonaData } from '@/lib/centerChat'
import ChatModeModal from '@/components/ui/ChatModeModal'
import NovelText from '@/components/ui/NovelText'
import ImageCarousel from '@/components/ui/ImageCarousel'
import SecretSettingsBlock from '@/components/ui/SecretSettingsBlock'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import { useDisplayName } from '@/lib/useDisplayName'
import { useRefetchOnForeground } from '@/lib/useRefetchOnForeground'

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string; secretSettings?: string
  openingMessage: string; tags: string[]; relatedImages?: string[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; tikitaMeta?: any
}

const WORLD_DEFAULTS = new Set(['ORGANIZATION', 'RULE', '세계관', 'STORY INTRO'])

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
  const [isEditingOpening, setIsEditingOpening] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [chatModeOpen, setChatModeOpen] = useState(false)
  const [pendingAiCharIds, setPendingAiCharIds] = useState<string[] | null>(null)
  const [standalone, setStandalone] = useState<PersonaCandidate[]>([])
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null)
  const userName = useDisplayName()

  // 세계관 편집 상태
  const [worldKeys, setWorldKeys] = useState<Set<string>>(new Set())
  const [editedSections, setEditedSections] = useState<Record<string, string>>({})
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set())
  const [worldKeysReady, setWorldKeysReady] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [worldSaving, setWorldSaving] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    api.get('/api/characters?unassigned=true')
      .then((list: any[]) => setStandalone(list.map((c: any) => ({ id: c.id, name: c.name, gender: c.gender || '', avatarUrl: c.avatarUrl ?? null }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  useRefetchOnForeground(() => {
    if (isEditingOpening) return
    api.get(`/api/collections/${id}`).then(setCol).catch(() => {})
  })

  useEffect(() => {
    const charId = col?.characters?.[0]?.id
    if (charId) {
      api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
    }
  }, [col])

  // col 로드 후 세계관 키 초기화 (한 번만)
  useEffect(() => {
    if (!col || worldKeysReady) return
    const m = col.tikitaMeta ?? {}
    const sections: Record<string, string> = m.introSections ?? {}
    if (Array.isArray(m.worldSectionKeys)) {
      setWorldKeys(new Set(m.worldSectionKeys as string[]))
    } else {
      setWorldKeys(new Set(Object.keys(sections).filter(k => WORLD_DEFAULTS.has(k))))
    }
    if (m.editedSections && typeof m.editedSections === 'object') {
      setEditedSections(m.editedSections as Record<string, string>)
    }
    if (Array.isArray(m.hiddenSections)) {
      setHiddenSections(new Set(m.hiddenSections as string[]))
    }
    setWorldKeysReady(true)
  }, [col, worldKeysReady])

  const startChat = () => {
    if (!col) return
    if (col.characters.length > 1) setChatModeOpen(true)
    else { setPendingAiCharIds(col.characters[0] ? [col.characters[0].id] : null); setPersonaOpen(true) }
  }

  const handleCtaClick = () => {
    if (existingConvs.length > 0) setShowNewChatConfirm(true)
    else startChat()
  }

  const saveWorldSettings = async () => {
    if (!col) return
    setWorldSaving(true)
    try {
      const updated = await api.patch(`/api/collections/${col.id}`, {
        tikitaMeta: {
          ...(col.tikitaMeta ?? {}),
          worldSectionKeys: Array.from(worldKeys),
          editedSections,
          hiddenSections: Array.from(hiddenSections),
        },
      })
      setCol(prev => prev ? { ...prev, tikitaMeta: updated.tikitaMeta } : prev)
    } catch (e: any) {
      setError('저장 실패: ' + e.message)
    } finally {
      setWorldSaving(false)
    }
  }

  const startEditSection = (key: string, fallback: string) => {
    setEditingKey(key)
    setEditingText(editedSections[key] ?? fallback)
  }

  const confirmEditSection = () => {
    if (!editingKey) return
    setEditedSections(prev => ({ ...prev, [editingKey]: editingText }))
    setEditingKey(null)
  }

  const cancelEditSection = () => setEditingKey(null)

  if (!col) return <div className="tikita-empty">불러오는 중...</div>

  const meta = col.tikitaMeta ?? {}
  const mainChar = col.characters[0]
  const aiCharIds = pendingAiCharIds ?? (mainChar ? [mainChar.id] : [])
  const personaCandidates = buildPersonaCandidates({
    collectionChars: col.characters.map(c => ({ id: c.id, name: c.name, gender: '', avatarUrl: c.avatarUrl })),
    standaloneCards: standalone,
    aiCharIds,
  })
  const introSections: Record<string, string> = meta.introSections ?? {}
  const personaDefault = introSections['PERSONA'] ?? introSections['페르소나'] ?? ''
  const tagline = meta.tagline ?? col.description ?? ''
  const opening = mainChar?.openingMessage ?? ''
  const illustrations: string[] = Array.isArray(meta.inlineIllustrations) ? meta.inlineIllustrations : (Array.isArray(mainChar?.relatedImages) ? mainChar.relatedImages : [])
  const gallery: { url: string; description?: string }[] =
    (Array.isArray(meta.gallery) ? meta.gallery : []).filter((g: any) => !g.locked)
  const chatStarters: string[] = Array.isArray(meta.chatStarters) ? meta.chatStarters : []
  const detailMd: string = meta.detailMd ?? ''
  // 캐릭터 상세설정 표시용: 카드 레벨 '상세 안내'(detailMd)와 겹치지 않게, 캐릭터 고유 부분만 남긴다.
  // (import가 additionalInfo=[character_intro, detail_md]로 합쳐 저장해 화면에 중복 노출되던 것 해소.
  //  AI 프롬프트용 원본 additionalInfo는 그대로 두고 표시만 정리.)
  const charSettingText = (info?: string): string => {
    const s = (info ?? '').trim()
    if (detailMd && s.includes(detailMd)) return s.split(detailMd).join('').replace(/\n{3,}/g, '\n\n').trim()
    return s
  }
  const introHtmlText: string = meta.introHtmlText ?? ''
  const episodeTitles: string[] = (Array.isArray(meta.episodes) ? meta.episodes : [])
    .map((e: any, i: number) => `${i + 1}. ${e.title || ''}`)

  const introSectionImages: Record<string, string[]> = meta.introSectionImages ?? {}
  const introSectionOrder: string[] = Array.isArray(meta.introSectionOrder) ? meta.introSectionOrder : []
  const charNames = col.characters.map(c => c.name)
  // 순서 배열 기준으로 정렬, 텍스트 없는 섹션 제외 (이미지만 있는 섹션은 카드 내 인라인 표시로 충분)
  const orderedKeys = introSectionOrder.length > 0
    ? introSectionOrder
    : Object.keys(introSections)
  const sectionEntries = orderedKeys
    .filter(k => introSections[k]?.trim())
    .map(k => [k, introSections[k]] as [string, string])
  const visibleSectionEntries = sectionEntries.filter(([k]) => !hiddenSections.has(k))
  const hiddenSectionEntries = sectionEntries.filter(([k]) => hiddenSections.has(k))
  const hasSections = sectionEntries.length > 0
  const hasIntroText = !!introHtmlText.trim()
  // 이미 섹션 카드 내에 인라인 표시되므로 별도 일러스트 섹션은 섹션 없는 스토리에만 표시
  const showTopIllustrations = illustrations.length > 0 && !hasSections

  // 세계관에 포함될 텍스트 계산 (대화 생성 시 사용)
  const buildScenarioText = () => {
    return Array.from(worldKeys)
      .map(k => {
        if (k === '__intro__') return editedSections['__intro__'] ?? introHtmlText
        return editedSections[k] ?? introSections[k] ?? ''
      })
      .filter(Boolean)
      .join('\n\n')
  }

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData, flip = true) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      // detail_md(상세 안내 = 스토리 시스템 설정)를 세계관에 한 번 포함 — 캐릭터마다 중복되지 않게.
      const scenarioText = [buildScenarioText(), detailMd].filter(Boolean).join('\n\n')
      const resp = await createCenterChat({
        collectionId: col.id,
        title: col.title,
        aiCharIds,
        personaCharId,
        newPersona,
        flipPlaceholders: flip,
        opening: opening.trim() ? opening : undefined,
        extras: { ...(scenarioText ? { scenarioDescription: scenarioText } : col.description ? { scenarioDescription: col.description } : {}) },
      })
      const startersParam = chatStarters.length > 0
        ? `?starters=${encodeURIComponent(JSON.stringify(chatStarters))}`
        : ''
      router.push(`/conversations/${resp.id}${startersParam}`)
    } catch (e: any) { setError('채팅방 생성 실패: ' + e.message); setCreating(false) }
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
          defaultSettings={personaDefault}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={handlePersonaSelect}
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
              </div>
            </div>
            {tagline && <p className="tikita-desc" style={{ marginBottom: 10 }}>{replaceDisplayPlaceholders(tagline, userName, charNames)}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tikita-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {/* 등장인물 */}
          {col.characters.length > 0 && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 className="tikita-section-title" style={{ margin: 0 }}>등장인물 ({col.characters.length})</h2>
                <button className="tikita-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--t-surface-2)' }}
                  onClick={() => router.push(`/characters/new?isTikita=true&collectionId=${col.id}`)}>
                  + 캐릭터 등록
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.characters.map((c, i) => {
                  const cInfo = charSettingText(c.additionalInfo)
                  return (
                  <div key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: cInfo ? 'pointer' : 'default' }}
                      onClick={() => cInfo && setExpandedCharId(expandedCharId === c.id ? null : c.id)}>
                      {c.avatarUrl
                        ? <img src={c.avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--t-line)', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, color: 'var(--t-ink)' }}>{i + 1}. {c.name}</div>
                        {cInfo && (
                          <div style={{ fontSize: 11, color: 'var(--t-ink-soft)', marginTop: 2 }}>
                            설정 {expandedCharId === c.id ? '접기 ▲' : '보기 ▼'}
                          </div>
                        )}
                      </div>
                    </div>
                    {expandedCharId === c.id && cInfo && (
                      <div className="tikita-intro-box" style={{ marginTop: 8 }}>
                        <NovelText text={replaceDisplayPlaceholders(cInfo, userName, charNames)} />
                      </div>
                    )}
                    <SecretSettingsBlock
                      characterId={c.id}
                      value={c.secretSettings ?? ''}
                      userName={userName}
                      charNames={charNames}
                      label={col.characters.length > 1 ? `비밀설정 — ${c.name}` : '비밀설정'}
                      onSaved={next => setCol(prev => prev ? { ...prev, characters: prev.characters.map(ch => ch.id === c.id ? { ...ch, secretSettings: next } : ch) } : prev)}
                    />
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {showTopIllustrations && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">일러스트</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {illustrations.map((src, i) => (
                  <img key={i} src={src} alt="" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                ))}
              </div>
            </div>
          )}

          {gallery.length > 0 && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">이미지 갤러리 ({gallery.length})</h2>
              <ImageCarousel
                images={gallery.map(g => ({ url: g.url, description: g.description }))}
                accent="var(--t-accent)"
                line="var(--t-line)"
              />
            </div>
          )}

          {/* 소개글 / 세계관 편집 */}
          {(hasSections || hasIntroText) && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 className="tikita-section-title" style={{ margin: 0 }}>
                  소개글{hasSections ? ` (${sectionEntries.length}개 섹션)` : ''}
                </h2>
                <button className="btn primary" style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={saveWorldSettings} disabled={worldSaving}>
                  {worldSaving ? '저장 중...' : '저장'}
                </button>
              </div>

              {/* 섹션 없음 경고 */}
              {!hasSections && (
                <div style={{ padding: '8px 10px', background: 'rgba(255,200,0,.08)', border: '1px solid rgba(255,200,0,.25)', borderRadius: 8, fontSize: 12, color: 'var(--t-ink-soft)', marginBottom: 8 }}>
                  ⚠️ 세계관 섹션 구분이 없습니다. 아래 내용을 편집 후 체크하면 세계관으로 사용됩니다.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {hasSections ? (
                  <>
                    {visibleSectionEntries.map(([name, text]) => {
                      const rawText = editedSections[name] ?? text
                      const isEditing = editingKey === name
                      const isWorld = worldKeys.has(name)
                      const sectionImgs = introSectionImages[name] ?? []
                      return (
                        <div key={name} style={{ border: `1px solid ${isWorld ? 'var(--t-accent)' : 'var(--t-line)'}`, borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: isWorld ? 'rgba(var(--t-accent-rgb, 180,100,255),.08)' : 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                            <input type="checkbox" checked={isWorld} onChange={e => {
                              setWorldKeys(prev => { const n = new Set(prev); e.target.checked ? n.add(name) : n.delete(name); return n })
                            }} style={{ cursor: 'pointer', flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: isWorld ? 'var(--t-accent)' : 'var(--t-ink-soft)', flex: 1 }}>{name}</span>
                            {isWorld && <span style={{ fontSize: 9, color: 'var(--t-accent)', opacity: 0.8 }}>세계관</span>}
                            {editedSections[name] && <span style={{ fontSize: 9, color: 'var(--t-ink-soft)' }}>수정됨</span>}
                            {!isEditing ? (
                              <>
                                <button className="btn ghost" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => startEditSection(name, text)}>✏</button>
                                <button className="btn ghost" style={{ fontSize: 10, padding: '1px 6px', color: 'var(--t-ink-soft)' }}
                                  onClick={() => setHiddenSections(prev => { const n = new Set(prev); n.add(name); return n })}>숨김</button>
                              </>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn primary" style={{ fontSize: 10, padding: '1px 7px' }} onClick={confirmEditSection}>완료</button>
                                <button className="btn ghost" style={{ fontSize: 10, padding: '1px 7px' }} onClick={cancelEditSection}>취소</button>
                              </div>
                            )}
                          </div>
                          <div style={{ padding: '8px 10px' }}>
                            {isEditing ? (
                              <textarea
                                value={editingText}
                                onChange={e => setEditingText(e.target.value)}
                                style={{ width: '100%', minHeight: 100, fontSize: 12, lineHeight: 1.6, background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: 8, color: 'var(--t-ink)', resize: 'vertical', boxSizing: 'border-box' }}
                              />
                            ) : (
                              <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--t-ink)', maxHeight: 200, overflow: 'auto' }}>
                                {replaceDisplayPlaceholders(rawText, userName, charNames)}
                              </div>
                            )}
                            {!isEditing && sectionImgs.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                {sectionImgs.map((src, idx) => (
                                  <img key={idx} src={src} alt="" loading="lazy"
                                    style={{ width: '100%', borderRadius: 6, display: 'block' }} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {/* 숨겨진 섹션 */}
                    {hiddenSectionEntries.length > 0 && (
                      <div>
                        <button className="btn ghost" style={{ fontSize: 11, padding: '3px 10px', width: '100%' }}
                          onClick={() => setShowHidden(p => !p)}>
                          {showHidden ? '▲' : '▼'} 숨겨진 섹션 ({hiddenSectionEntries.length}개)
                        </button>
                        {showHidden && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                            {hiddenSectionEntries.map(([name]) => (
                              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'var(--t-surface-2)', borderRadius: 6, border: '1px solid var(--t-line)' }}>
                                <span style={{ fontSize: 11, color: 'var(--t-ink-soft)', flex: 1 }}>{name}</span>
                                <button className="btn ghost" style={{ fontSize: 10, padding: '1px 7px' }}
                                  onClick={() => setHiddenSections(prev => { const n = new Set(prev); n.delete(name); return n })}>보이기</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* 비섹션: 전체 intro 텍스트 */
                  (() => {
                    const key = '__intro__'
                    const fallback = introHtmlText
                    const isEditing = editingKey === key
                    const rawText = editedSections[key] ?? fallback
                    const isWorld = worldKeys.has(key)
                    return (
                      <div style={{ border: `1px solid ${isWorld ? 'var(--t-accent)' : 'var(--t-line)'}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: isWorld ? 'rgba(var(--t-accent-rgb, 180,100,255),.08)' : 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                          <input type="checkbox" checked={isWorld} onChange={e => {
                            setWorldKeys(prev => { const n = new Set(prev); e.target.checked ? n.add(key) : n.delete(key); return n })
                          }} style={{ cursor: 'pointer', flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-ink-soft)', flex: 1 }}>전체 소개글</span>
                          {isWorld && <span style={{ fontSize: 9, color: 'var(--t-accent)', opacity: 0.8 }}>세계관</span>}
                          {editedSections[key] && <span style={{ fontSize: 9, color: 'var(--t-ink-soft)' }}>수정됨</span>}
                          {!isEditing ? (
                            <button className="btn ghost" style={{ fontSize: 10, padding: '1px 7px' }} onClick={() => startEditSection(key, fallback)}>✏</button>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn primary" style={{ fontSize: 10, padding: '1px 7px' }} onClick={confirmEditSection}>완료</button>
                              <button className="btn ghost" style={{ fontSize: 10, padding: '1px 7px' }} onClick={cancelEditSection}>취소</button>
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                          {isEditing ? (
                            <textarea
                              value={editingText}
                              onChange={e => setEditingText(e.target.value)}
                              style={{ width: '100%', minHeight: 120, fontSize: 12, lineHeight: 1.6, background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: 8, color: 'var(--t-ink)', resize: 'vertical', boxSizing: 'border-box' }}
                            />
                          ) : (
                            <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--t-ink)', maxHeight: 200, overflow: 'auto' }}>
                              {replaceDisplayPlaceholders(rawText, userName, charNames)}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()
                )}
              </div>
            </div>
          )}

          {detailMd && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">상세 안내</h2>
              <div className="tikita-intro-box" style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7 }}>
                {replaceDisplayPlaceholders(detailMd, userName, charNames)}
              </div>
            </div>
          )}

          {episodeTitles.length > 0 && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">에피소드 ({episodeTitles.length})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {episodeTitles.map((t, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--t-ink-soft)', padding: '4px 0', borderBottom: '1px solid var(--t-line)' }}>{replaceDisplayPlaceholders(t, userName, charNames)}</div>
                ))}
              </div>
            </div>
          )}

          {opening.trim() && (
            <div className="tikita-section" style={{ paddingTop: 0 }}>
              <h2 className="tikita-section-title">첫 장면</h2>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                {!isEditingOpening && (
                  <button className="tikita-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--t-surface-2)' }}
                    onClick={() => { setEditContent(opening); setIsEditingOpening(true) }}>
                    ✏ 편집
                  </button>
                )}
              </div>
              {isEditingOpening ? (
                <div className="vstack" style={{ gap: 8 }}>
                  <textarea className="field" rows={8}
                    style={{ fontSize: 13, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-ink)', padding: 10, borderRadius: 10, width: '100%', resize: 'vertical' }}
                    value={editContent} onChange={e => setEditContent(e.target.value)} />
                  <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={async () => {
                      if (!mainChar) return
                      try {
                        await api.patch(`/api/characters/${mainChar.id}`, { openingMessage: editContent })
                        setCol(prev => prev ? { ...prev, characters: prev.characters.map(c => c.id === mainChar.id ? { ...c, openingMessage: editContent } : c) } : prev)
                        setIsEditingOpening(false)
                      } catch (e: any) { setError('도입부 수정 실패: ' + e.message) }
                    }}>저장</button>
                    <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setIsEditingOpening(false)}>취소</button>
                  </div>
                </div>
              ) : (
                <div className="tikita-intro-box">
                  <NovelText text={replaceDisplayPlaceholders(opening, userName, charNames)} />
                </div>
              )}
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
