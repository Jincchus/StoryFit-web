'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import NovelText from '@/components/ui/NovelText'
import TingleCardPreviewSheet from '@/components/ui/TingleCardPreviewSheet'
import { getOpenings } from '@/lib/openings'
import { useDisplayName } from '@/lib/useDisplayName'
import { useRefetchOnForeground } from '@/lib/useRefetchOnForeground'

interface Lorebook { id: string; keyword: string[]; content: string; priority: number }

interface TingleField { key: string; label: string; value: string; order: number }

interface TingleCol {
  id: string; title: string; coverImageUrl: string; description?: string; tags: string[]
  sourceUrl: string
  tingleMeta?: { type: string; fields: TingleField[]; openings: any[] }
  characters: { id: string; name: string; avatarUrl: string | null; additionalInfo: string; openingMessage: string; openingMessages?: any[] }[]
}

function tingleType(sourceUrl: string) {
  if (sourceUrl?.includes('/universes/')) return 'universe'
  if (sourceUrl?.includes('/scenes/')) return 'scene'
  return 'character'
}

function SelectList({ items, selectedId, accentColor, noneLabel, onSelect, onPreview, onAddUrl }: {
  items: TingleCol[]; selectedId: string | null; accentColor: string; noneLabel: string
  onSelect: (id: string | null) => void
  onPreview?: (id: string) => void
  onAddUrl?: (url: string) => Promise<void>
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState('')

  const handleAdd = async () => {
    if (!addUrl.trim() || adding || !onAddUrl) return
    setAdding(true); setAddErr('')
    try {
      await onAddUrl(addUrl.trim())
      setAddUrl(''); setAddOpen(false)
    } catch (e: any) {
      setAddErr(e.message ?? '추가 실패')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button onClick={() => onSelect(null)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderRadius: 8, cursor: 'pointer', textAlign: 'left', appearance: 'none',
        border: `1.5px solid ${!selectedId ? accentColor : 'var(--tg-line)'}`,
        background: !selectedId ? `${accentColor}18` : 'var(--tg-surface)',
      }}>
        <span style={{ fontSize: 12, color: !selectedId ? accentColor : 'var(--tg-ink-soft)', fontWeight: !selectedId ? 700 : 400 }}>{noneLabel}</span>
      </button>
      {items.map(item => (
        <button key={item.id} onClick={() => onPreview ? onPreview(item.id) : onSelect(item.id)} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          borderRadius: 8, cursor: 'pointer', textAlign: 'left', appearance: 'none',
          border: `1.5px solid ${selectedId === item.id ? accentColor : 'var(--tg-line)'}`,
          background: selectedId === item.id ? `${accentColor}18` : 'var(--tg-surface)',
        }}>
          {item.coverImageUrl && <img src={item.coverImageUrl} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />}
          <span style={{ fontSize: 12, fontWeight: 600, color: selectedId === item.id ? accentColor : 'var(--tg-ink)' }}>{item.title}</span>
        </button>
      ))}
      {onAddUrl && (
        addOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                className="field" value={addUrl} autoFocus
                onChange={e => { setAddUrl(e.target.value); setAddErr('') }}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="팅글 URL 붙여넣기"
                style={{ fontSize: 12, flex: 1 }}
              />
              <button onClick={handleAdd} disabled={adding} style={{
                appearance: 'none', border: 'none', background: accentColor, color: '#fff',
                borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>{adding ? '...' : '추가'}</button>
              <button onClick={() => { setAddOpen(false); setAddUrl(''); setAddErr('') }} style={{
                appearance: 'none', border: 'none', background: 'var(--tg-surface-2)', color: 'var(--tg-ink-soft)',
                borderRadius: 8, padding: '0 10px', cursor: 'pointer', fontSize: 13, flexShrink: 0,
              }}>✕</button>
            </div>
            {addErr && <div style={{ fontSize: 11, color: '#ff6b8a' }}>{addErr}</div>}
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)} style={{
            appearance: 'none', border: `1.5px dashed ${accentColor}55`, background: 'transparent',
            borderRadius: 8, padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
            fontSize: 12, color: accentColor, fontWeight: 600,
          }}>+ URL로 추가</button>
        )
      )}
    </div>
  )
}

export default function TingleSceneDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<TingleCol | null>(null)
  const [allTingle, setAllTingle] = useState<TingleCol[]>([])
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  const [selectedUniverseId, setSelectedUniverseId] = useState<string | null>(null)
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [worldSaving, setWorldSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<{ id: string; label: string; accentColor: string; onConfirm: () => void } | null>(null)
  const userName = useDisplayName()

  useEffect(() => {
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
      api.get(`/api/lorebooks?collectionId=${id}`),
    ]).then(([c, all, lb]) => { setCol(c); setAllTingle(all); setLorebooks(lb) }).catch(() => {})
    setSelectedCharId(localStorage.getItem(`tg_char_scene_${id}`) ?? null)
    setSelectedUniverseId(localStorage.getItem(`tg_uni_scene_${id}`) ?? null)
  }, [id])

  useRefetchOnForeground(() => {
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
      api.get(`/api/lorebooks?collectionId=${id}`),
    ]).then(([c, all, lb]) => { setCol(c); setAllTingle(all); setLorebooks(lb) }).catch(() => {})
  })

  const characters = allTingle.filter(c => tingleType(c.sourceUrl) === 'character')
  const universes = allTingle.filter(c => tingleType(c.sourceUrl) === 'universe')
  const selectedChar = characters.find(c => c.id === selectedCharId) ?? null
  const selectedUniverse = universes.find(u => u.id === selectedUniverseId) ?? null

  const handleSelectChar = (cid: string | null) => {
    setSelectedCharId(cid); setOpeningIdx(0)
    cid ? localStorage.setItem(`tg_char_scene_${id}`, cid) : localStorage.removeItem(`tg_char_scene_${id}`)
  }
  const handleSelectUniverse = (uid: string | null) => {
    setSelectedUniverseId(uid)
    uid ? localStorage.setItem(`tg_uni_scene_${id}`, uid) : localStorage.removeItem(`tg_uni_scene_${id}`)
  }

  const handleDelete = async () => {
    if (!confirm('이 테마를 삭제할까요?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/collections/${id}`)
      router.push('/tingle')
    } catch { setDeleting(false) }
  }

  const handleWorldRegister = async () => {
    if (!col || worldSaving) return
    setWorldSaving(true)
    try {
      const content = col.characters[0]?.additionalInfo || col.description || ''
      if (!content.trim()) return
      const lb = await api.post('/api/lorebooks', {
        collectionId: id,
        keyword: [col.title],
        content,
        priority: 50,
      })
      setLorebooks(prev => [...prev, lb])
    } catch (e: any) {
      alert('등록 실패: ' + e.message)
    } finally { setWorldSaving(false) }
  }

  const handleWorldUnregister = async () => {
    if (!confirm('세계관 등록을 해제할까요?') || worldSaving) return
    setWorldSaving(true)
    try {
      await Promise.all(lorebooks.map(lb => api.delete(`/api/lorebooks/${lb.id}`)))
      setLorebooks([])
    } catch (e: any) {
      alert('해제 실패: ' + e.message)
    } finally { setWorldSaving(false) }
  }

  const handleAddUrl = async (url: string) => {
    await api.post('/api/characters/import', { url })
    const all = await api.get('/api/collections?isTingle=true')
    setAllTingle(all)
  }

  if (!col) return <div className="tingle-empty">불러오는 중...</div>

  const mainChar = col.characters[0]
  const charNames = col.characters.map(c => c.name)

  const activeChar = selectedChar?.characters[0] ?? null
  const openings = getOpenings(activeChar)

  const buildScenario = () => {
    const parts: string[] = []
    // 테마 자체 설명
    const sceneTxt = mainChar?.additionalInfo || col.description || ''
    if (sceneTxt) parts.push(`[테마: ${col.title}]\n${sceneTxt}`)
    // 선택된 서사
    if (selectedUniverse) {
      const txt = selectedUniverse.characters[0]?.additionalInfo || selectedUniverse.description || ''
      if (txt) parts.push(`[서사: ${selectedUniverse.title}]\n${txt}`)
    }
    return parts.join('\n\n')
  }

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData) => {
    if (!activeChar) return
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newPersona) {
        const p = await api.post('/api/characters', {
          name: newPersona.name, gender: newPersona.gender, additionalInfo: newPersona.additionalInfo,
          collectionId: selectedChar!.id,
        })
        personaId = p.id
      }
      const chosen = openings[openingIdx]?.content
      const scenarioDescription = buildScenario()
      const extraCollectionIds = [col.id, selectedUniverseId].filter(Boolean) as string[]
      const resp = await api.post('/api/conversations', {
        title: `${selectedChar!.title} × ${col.title}`,
        characterIds: [activeChar.id],
        mode: 'story',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
        ...(scenarioDescription ? { scenarioDescription } : {}),
        ...(extraCollectionIds.length > 0 ? { extraCollectionIds } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
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
          label="테마"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--tg-ink)' }}>{col.title}</h1>
                <div style={{ fontSize: 11, color: '#06bfd6', fontWeight: 700 }}>테마</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                  onClick={() => setShowEdit(true)}>✏ 정보</button>
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: '#ff6b8a22', color: '#ff6b8a', padding: '4px 8px', fontSize: 11 }}
                  onClick={handleDelete} disabled={deleting}>🗑 삭제</button>
              </div>
            </div>
            {(() => { const v = col.tingleMeta?.fields?.find(f => f.key === 'introduction')?.value ?? col.description ?? ''; return v ? <p style={{ color: 'var(--tg-ink-soft)', margin: '0 0 10px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{replaceDisplayPlaceholders(v, userName, charNames)}</p> : null })()}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tingle-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {/* 테마 설명 — tingleMeta.fields 있으면 라벨별 섹션, 없으면 단일 블록 */}
          {(col.tingleMeta?.fields?.length ?? 0) > 0 ? (
            (col.tingleMeta!.fields as TingleField[]).filter(f => f.key !== 'introduction').map((f) => f.value?.trim() ? (
              <div key={f.key} className="tingle-section" style={{ paddingTop: 0 }}>
                <h2 className="tingle-section-title">{f.label}</h2>
                <div className="tingle-intro-box">
                  <div className="tingle-desc" style={{ whiteSpace: 'pre-wrap' }}>
                    {replaceDisplayPlaceholders(f.value, userName, charNames)}
                  </div>
                </div>
              </div>
            ) : null)
          ) : (col.description?.trim() || mainChar?.additionalInfo?.trim()) ? (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">테마 설명</h2>
              <div className="tingle-intro-box">
                <div className="tingle-desc" style={{ whiteSpace: 'pre-wrap' }}>
                  {replaceDisplayPlaceholders(mainChar?.additionalInfo || col.description || '', userName, charNames)}
                </div>
              </div>
            </div>
          ) : null}

          {/* 세계관 등록 */}
          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#06bfd6' }}>세계관 등록</h2>
            {lorebooks.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #06bfd6', background: '#06bfd618' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#06bfd6', flex: 1 }}>✓ 세계관 등록됨 — 채팅방 생성 시 자동 포함</span>
                <button
                  onClick={handleWorldUnregister}
                  disabled={worldSaving}
                  style={{ appearance: 'none', border: 'none', background: '#ff6b8a22', color: '#ff6b8a', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                  {worldSaving ? '...' : '해제'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleWorldRegister}
                disabled={worldSaving || !(col.characters[0]?.additionalInfo || col.description)}
                style={{ width: '100%', appearance: 'none', border: '1.5px dashed #06bfd655', background: 'transparent', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#06bfd6', fontWeight: 600 }}>
                {worldSaving ? '등록 중...' : '+ 세계관으로 등록 (채팅방에 자동 포함)'}
              </button>
            )}
          </div>

          {/* 캐릭터 선택 */}
          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#ff5776' }}>캐릭터 선택</h2>
            <SelectList items={characters} selectedId={selectedCharId} accentColor="#ff5776" noneLabel="캐릭터 없음" onSelect={handleSelectChar} onPreview={id => setPreviewTarget({ id, label: '캐릭터', accentColor: '#ff5776', onConfirm: () => handleSelectChar(id) })} onAddUrl={handleAddUrl} />
          </div>

          {/* 선택된 캐릭터의 도입부 */}
          {selectedChar && openings.length > 0 && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">도입부 ({selectedChar.title})</h2>
              {openings.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {openings.map((op, i) => (
                    <button key={op.id}
                      style={{ appearance: 'none', border: 'none', cursor: 'pointer', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                        background: i === openingIdx ? 'var(--tg-accent)' : 'var(--tg-surface-2)',
                        color: i === openingIdx ? '#fff' : 'var(--tg-ink-soft)' }}
                      onClick={() => setOpeningIdx(i)}>
                      {op.title}
                    </button>
                  ))}
                </div>
              )}
              <div className="tingle-intro-box">
                <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', userName, [selectedChar.title])} />
              </div>
            </div>
          )}

          {/* 서사 선택 */}
          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#a78bfa' }}>서사 선택</h2>
            <SelectList items={universes} selectedId={selectedUniverseId} accentColor="#a78bfa" noneLabel="서사 없음" onSelect={handleSelectUniverse} onPreview={id => setPreviewTarget({ id, label: '서사', accentColor: '#a78bfa', onConfirm: () => handleSelectUniverse(id) })} onAddUrl={handleAddUrl} />
          </div>

          {error && <div style={{ padding: '0 16px 8px', fontSize: 12, color: '#ff6b8a' }}>{error}</div>}
          <div style={{ height: 80 }} />
        </div>

        <div className="tingle-cta">
          <button className="tingle-cta-btn" disabled={creating || !selectedChar} onClick={() => setPersonaOpen(true)}>
            {creating ? '생성 중...' : selectedChar ? '대화 시작' : '캐릭터를 선택해주세요'}
          </button>
        </div>
      </div>
    </>
  )
}
