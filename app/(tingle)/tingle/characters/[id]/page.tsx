'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import ZoomableImage from '@/components/ui/ZoomableImage'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal from '@/components/ui/WhifPersonaModal'
import { createCenterChat, buildPersonaCandidates, type PersonaCandidate, type NewPersonaData } from '@/lib/centerChat'
import ChatModeModal from '@/components/ui/ChatModeModal'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import NovelText from '@/components/ui/NovelText'
import SecretSettingsBlock from '@/components/ui/SecretSettingsBlock'
import MappedCharacters from '@/components/ui/MappedCharacters'
import TingleCardPreviewSheet from '@/components/ui/TingleCardPreviewSheet'
import { getOpenings } from '@/lib/openings'
import { useRefetchOnForeground } from '@/lib/useRefetchOnForeground'
import { useDisplayName } from '@/lib/useDisplayName'

interface TingleField { key: string; label: string; value: string; order: number }

interface TingleCol {
  id: string; title: string; coverImageUrl: string; description?: string; tags: string[]
  sourceUrl: string
  tingleMeta?: { type: string; fields: TingleField[]; openings: any[] }
  characters: { id: string; name: string; avatarUrl: string | null; gender?: string; additionalInfo: string; secretSettings?: string; openingMessage: string; openingMessages?: any[] }[]
}

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function tingleType(sourceUrl: string) {
  if (sourceUrl?.includes('/universes/')) return 'universe'
  if (sourceUrl?.includes('/scenes/')) return 'scene'
  return 'character'
}

function TinglePickerModal({ items, selectedId, accentColor, title, noneLabel, onSelect, onPreview, onClose }: {
  items: TingleCol[]; selectedId: string | null; accentColor: string; title: string; noneLabel: string
  onSelect: (id: string | null) => void
  onPreview: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? items.filter(x => x.title.toLowerCase().includes(query.toLowerCase()) || x.tags?.some(t => t.toLowerCase().includes(query.toLowerCase())))
    : items

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--tg-bg)', borderRadius: '16px 16px 0 0' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: accentColor }}>{title}</div>
          <button onClick={onClose} style={{ appearance: 'none', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--tg-ink-soft)' }}>✕</button>
        </div>
        <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
          <input className="field" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="이름·태그로 검색" style={{ fontSize: 12, width: '100%' }} autoFocus />
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 24px' }}>
          {/* 없음 */}
          <div onClick={() => onSelect(null)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
            borderBottom: '1px solid var(--tg-line)', cursor: 'pointer',
            background: !selectedId ? `${accentColor}14` : 'transparent',
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--tg-surface-2)', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>✕</div>
            <span style={{ fontSize: 13, fontWeight: !selectedId ? 700 : 400, color: !selectedId ? accentColor : 'var(--tg-ink-soft)' }}>{noneLabel}</span>
            {!selectedId && <span style={{ marginLeft: 'auto', fontSize: 13, color: accentColor }}>✓</span>}
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: 'var(--tg-ink-soft)' }}>
              {items.length === 0 ? '가져온 항목이 없습니다.' : '검색 결과 없음'}
            </div>
          )}
          {filtered.map(item => (
            <div key={item.id} onClick={() => onPreview(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
              borderBottom: '1px solid var(--tg-line)', cursor: 'pointer',
              background: selectedId === item.id ? `${accentColor}14` : 'transparent',
            }}>
              {item.coverImageUrl
                ? <img src={item.coverImageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--tg-surface-2)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>🎭</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: selectedId === item.id ? accentColor : 'var(--tg-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                {item.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {item.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 9, color: 'var(--tg-ink-soft)', background: 'var(--tg-surface-2)', padding: '1px 5px', borderRadius: 10 }}>#{t}</span>)}
                  </div>
                )}
              </div>
              {selectedId === item.id && <span style={{ fontSize: 14, color: accentColor, flexShrink: 0 }}>✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TingleCharacterDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<TingleCol | null>(null)
  const [allTingle, setAllTingle] = useState<TingleCol[]>([])
  const [openingIdx, setOpeningIdx] = useState(0)
  const [selectedUniverseId, setSelectedUniverseId] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [existingConvs, setExistingConvs] = useState<any[]>([])
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [isEditingOpening, setIsEditingOpening] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [chatModeOpen, setChatModeOpen] = useState(false)
  const [pendingAiCharIds, setPendingAiCharIds] = useState<string[] | null>(null)
  const [standalone, setStandalone] = useState<PersonaCandidate[]>([])

  const handleDelete = async () => {
    if (!confirm('이 항목을 삭제할까요?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/collections/${id}`)
      router.push('/tingle')
    } catch (e: any) {
      setDeleting(false)
    }
  }

  const [uniPickerOpen, setUniPickerOpen] = useState(false)
  const [scenePickerOpen, setScenePickerOpen] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<{ id: string; label: string; accentColor: string; onConfirm: () => void } | null>(null)
  const userName = useDisplayName()

  useEffect(() => {
    api.get('/api/characters?unassigned=true')
      .then((list: any[]) => setStandalone(list.map((c: any) => ({ id: c.id, name: c.name, gender: c.gender || '', avatarUrl: c.avatarUrl ?? null }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const charId = col?.characters?.[0]?.id
    if (charId) {
      api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
    }
  }, [col])

  useEffect(() => {
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
    ]).then(([c, all]) => { setCol(c); setAllTingle(all) }).catch(() => {})
    setSelectedUniverseId(localStorage.getItem(`tg_uni_${id}`) ?? null)
    setSelectedSceneId(localStorage.getItem(`tg_scene_${id}`) ?? null)
  }, [id])

  useRefetchOnForeground(() => {
    if (isEditingOpening) return
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
    ]).then(([c, all]) => { setCol(c); setAllTingle(all) }).catch(() => {})
  })

  const universes = allTingle.filter(c => tingleType(c.sourceUrl) === 'universe')
  const scenes = allTingle.filter(c => tingleType(c.sourceUrl) === 'scene')
  const selectedUniverse = universes.find(u => u.id === selectedUniverseId) ?? null
  const selectedScene = scenes.find(s => s.id === selectedSceneId) ?? null


  const handleSelectUniverse = (uid: string | null) => {
    setSelectedUniverseId(uid)
    uid ? localStorage.setItem(`tg_uni_${id}`, uid) : localStorage.removeItem(`tg_uni_${id}`)
    setUniPickerOpen(false)
  }
  const handleSelectScene = (sid: string | null) => {
    setSelectedSceneId(sid)
    sid ? localStorage.setItem(`tg_scene_${id}`, sid) : localStorage.removeItem(`tg_scene_${id}`)
    setScenePickerOpen(false)
  }

  const startChat = () => {
    if (!col) return
    if (col.characters.length > 1) {
      setChatModeOpen(true)
    } else {
      setPendingAiCharIds(col.characters[0] ? [col.characters[0].id] : null)
      setPersonaOpen(true)
    }
  }

  if (!col) return <div className="tingle-empty">불러오는 중...</div>

  const mainChar = col.characters[0]
  const aiCharIds = pendingAiCharIds ?? (mainChar ? [mainChar.id] : [])
  const personaCandidates = buildPersonaCandidates({
    collectionChars: col.characters.map(c => ({ id: c.id, name: c.name, gender: c.gender || '', avatarUrl: c.avatarUrl })),
    standaloneCards: standalone,
    aiCharIds,
  })
  const charNames = col.characters.map(c => c.name)
  const introText = col.tingleMeta?.fields?.find(f => f.key === 'introduction')?.value ?? col.description ?? ''
  const openings = getOpenings(mainChar)

  const buildScenario = () => {
    const parts: string[] = []
    if (selectedUniverse) {
      const txt = selectedUniverse.characters[0]?.additionalInfo || selectedUniverse.description || ''
      if (txt) parts.push(`[서사: ${selectedUniverse.title}]\n${txt}`)
    }
    if (selectedScene) {
      const txt = selectedScene.characters[0]?.additionalInfo || selectedScene.description || ''
      if (txt) parts.push(`[테마: ${selectedScene.title}]\n${txt}`)
    }
    return parts.join('\n\n')
  }

  const handleCtaClick = () => {
    if (existingConvs.length > 0) {
      setShowNewChatConfirm(true)
    } else {
      startChat()
    }
  }

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData, flip = false) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      const chosen = openings[openingIdx]?.content
      const scenarioDescription = buildScenario()
      const extraCollectionIds = [selectedUniverseId, selectedSceneId].filter(Boolean) as string[]
      const resp = await createCenterChat({
        collectionId: col.id,
        title: col.title,
        aiCharIds,
        personaCharId,
        newPersona,
        flipPlaceholders: flip,
        opening: chosen,
        extras: {
          ...(scenarioDescription ? { scenarioDescription } : {}),
          ...(extraCollectionIds.length > 0 ? { extraCollectionIds } : {}),
        },
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) { setError('채팅방 생성 실패: ' + e.message); setCreating(false) }
  }

  return (
    <>
      {uniPickerOpen && (
        <TinglePickerModal items={universes} selectedId={selectedUniverseId} accentColor="#a78bfa"
          title="서사 선택" noneLabel="서사 없음" onSelect={handleSelectUniverse}
          onPreview={id => setPreviewTarget({ id, label: '서사', accentColor: '#a78bfa', onConfirm: () => { handleSelectUniverse(id); setUniPickerOpen(false) } })}
          onClose={() => setUniPickerOpen(false)} />
      )}
      {scenePickerOpen && (
        <TinglePickerModal items={scenes} selectedId={selectedSceneId} accentColor="#06bfd6"
          title="테마 선택" noneLabel="테마 없음" onSelect={handleSelectScene}
          onPreview={id => setPreviewTarget({ id, label: '테마', accentColor: '#06bfd6', onConfirm: () => { handleSelectScene(id); setScenePickerOpen(false) } })}
          onClose={() => setScenePickerOpen(false)} />
      )}
      {previewTarget && (
        <TingleCardPreviewSheet
          collectionId={previewTarget.id}
          label={previewTarget.label}
          accentColor={previewTarget.accentColor}
          onConfirm={previewTarget.onConfirm}
          onClose={() => setPreviewTarget(null)}
        />
      )}

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
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={handlePersonaSelect}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="tingle-scroll">
          <div className="tingle-cover-wrap">
            {col.coverImageUrl
              ? <ZoomableImage className="tingle-cover" src={col.coverImageUrl} alt="" />
              : <div className="tingle-cover" />}
            <button className="tingle-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="tingle-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--tg-ink)' }}>{col.title}</h1>
                <div style={{ fontSize: 11, color: '#ff5776', fontWeight: 700 }}>캐릭터</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                  onClick={() => setShowEdit(true)}>✏ 정보</button>
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                  onClick={() => router.push(`/characters/new?isTingle=true&collectionId=${col.id}`)}>+ 캐릭터 등록</button>
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: '#ff6b8a22', color: '#ff6b8a', padding: '4px 8px', fontSize: 11 }}
                  onClick={handleDelete} disabled={deleting}>🗑 삭제</button>
              </div>
            </div>
            {introText && <p style={{ color: 'var(--tg-ink-soft)', margin: '0 0 10px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{replaceDisplayPlaceholders(introText, userName, charNames)}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tingle-chip">#{t}</span>)}
              </div>
            )}
          </div>

          <MappedCharacters characters={col.characters} prefix="tg" personaName={userName} />

          {(col.tingleMeta?.fields?.length ?? 0) > 0 ? (() => {
            const detailFields = (col.tingleMeta!.fields as TingleField[]).filter(f => f.key !== 'introduction' && f.value?.trim())
            const genderStr = mainChar?.gender?.trim()
            const allFields = genderStr
              ? [{ key: 'gender', label: '성별', value: genderStr, order: 0 }, ...detailFields]
              : detailFields
            if (allFields.length === 0) return null
            return (
              <div className="tingle-section" style={{ paddingTop: 0 }}>
                <h2 className="tingle-section-title">상세정보</h2>
                <div className="tingle-intro-box">
                  {allFields.map((f, i) => (
                    <div key={f.key} style={{
                      display: 'flex', gap: 12, padding: '8px 0',
                      borderBottom: i < allFields.length - 1 ? '1px solid var(--tg-line)' : 'none',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--tg-accent)', fontWeight: 700, minWidth: 60, flexShrink: 0, paddingTop: 2 }}>
                        {f.label}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--tg-ink)', whiteSpace: 'pre-wrap', flex: 1, lineHeight: 1.6 }}>
                        {replaceDisplayPlaceholders(f.value, userName, charNames)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })() : mainChar?.additionalInfo?.trim() ? (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">캐릭터 설정</h2>
              <div className="tingle-intro-box">
                <div className="tingle-desc" style={{ whiteSpace: 'pre-wrap' }}>
                  {replaceDisplayPlaceholders(mainChar.additionalInfo, userName, charNames)}
                </div>
              </div>
            </div>
          ) : null}

          {mainChar && (
            <SecretSettingsBlock
              className="tingle-section"
              characterId={mainChar.id}
              value={mainChar.secretSettings ?? ''}
              userName={userName}
              charNames={charNames}
              onSaved={next => setCol(prev => prev ? { ...prev, characters: prev.characters.map(ch => ch.id === mainChar.id ? { ...ch, secretSettings: next } : ch) } : prev)}
            />
          )}

          {openings.length > 0 && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">도입부</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                {openings.map((op, i) => (
                  <button key={op.id}
                    style={{ appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                      background: i === openingIdx ? 'var(--tg-accent)' : 'var(--tg-surface-2)',
                      color: i === openingIdx ? '#fff' : 'var(--tg-ink-soft)' }}
                    onClick={() => { setOpeningIdx(i); setIsEditingOpening(false) }}>
                    {op.title}
                  </button>
                ))}
                {!isEditingOpening && (
                  <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', marginLeft: 'auto' }}
                    onClick={() => { setEditContent(openings[openingIdx]?.content ?? ''); setIsEditingOpening(true) }}>
                    ✏ 편집
                  </button>
                )}
              </div>
              {isEditingOpening ? (
                <div className="vstack" style={{ gap: 8 }}>
                  <textarea className="field" rows={8}
                    style={{ fontSize: 13, background: 'var(--tg-surface)', border: '1px solid var(--tg-line)', color: 'var(--tg-ink)', padding: 10, borderRadius: 10, width: '100%', resize: 'vertical' }}
                    value={editContent} onChange={e => setEditContent(e.target.value)} />
                  <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={async () => {
                      if (!mainChar) return
                      const target = openings[openingIdx]
                      if (!target) return
                      try {
                        const updated = openings.map(o => o.id === target.id ? { ...o, content: editContent } : o)
                        await api.patch(`/api/characters/${mainChar.id}`, { openingMessages: updated })
                        setCol(prev => prev ? { ...prev, characters: prev.characters.map(c => c.id === mainChar.id ? { ...c, openingMessages: updated as any } : c) } : prev)
                        setIsEditingOpening(false)
                      } catch (e: any) { setError('도입부 수정 실패: ' + e.message) }
                    }}>저장</button>
                    <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setIsEditingOpening(false)}>취소</button>
                  </div>
                </div>
              ) : (
                <div className="tingle-intro-box">
                  <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', userName, charNames)} />
                </div>
              )}
            </div>
          )}

          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#a78bfa' }}>서사 선택</h2>
            <button onClick={() => setUniPickerOpen(true)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              appearance: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              border: `1.5px solid ${selectedUniverse ? '#a78bfa' : 'var(--tg-line)'}`,
              background: selectedUniverse ? '#a78bfa18' : 'var(--tg-surface)',
            }}>
              {selectedUniverse?.coverImageUrl && <img src={selectedUniverse.coverImageUrl} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />}
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedUniverse ? '#a78bfa' : 'var(--tg-ink-soft)', flex: 1 }}>
                {selectedUniverse ? selectedUniverse.title : '서사 없음'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--tg-ink-soft)' }}>▼</span>
            </button>
          </div>

          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#06bfd6' }}>테마 선택</h2>
            <button onClick={() => setScenePickerOpen(true)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              appearance: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              border: `1.5px solid ${selectedScene ? '#06bfd6' : 'var(--tg-line)'}`,
              background: selectedScene ? '#06bfd618' : 'var(--tg-surface)',
            }}>
              {selectedScene?.coverImageUrl && <img src={selectedScene.coverImageUrl} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />}
              <span style={{ fontSize: 13, fontWeight: 600, color: selectedScene ? '#06bfd6' : 'var(--tg-ink-soft)', flex: 1 }}>
                {selectedScene ? selectedScene.title : '테마 없음'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--tg-ink-soft)' }}>▼</span>
            </button>
          </div>

          {existingConvs.length > 0 && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--tg-surface)', border: '1px solid var(--tg-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tg-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--tg-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.messages[0].content}</div>
                      )}
                    </div>
                    <div style={{ color: 'var(--tg-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '0 16px 8px', fontSize: 12, color: '#ff6b8a' }}>{error}</div>}
          <div style={{ height: 80 }} />
        </div>

        <div className="tingle-cta">
          <button className="tingle-cta-btn" disabled={creating || !mainChar} onClick={handleCtaClick}>
            {creating ? '생성 중...' : existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작'}
          </button>
        </div>
      </div>
    </>
  )
}
