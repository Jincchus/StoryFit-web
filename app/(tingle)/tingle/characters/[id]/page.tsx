'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import CollectionEditModal from '@/components/ui/CollectionEditModal'
import NovelText from '@/components/ui/NovelText'
import { getOpenings } from '@/lib/openings'
import { useDisplayName } from '@/lib/useDisplayName'

interface TingleCol {
  id: string; title: string; coverImageUrl: string; description?: string; tags: string[]
  sourceUrl: string
  characters: { id: string; name: string; avatarUrl: string | null; additionalInfo: string; openingMessage: string; openingMessages?: any[] }[]
}

function tingleType(sourceUrl: string) {
  if (sourceUrl?.includes('/universes/')) return 'universe'
  if (sourceUrl?.includes('/scenes/')) return 'scene'
  return 'character'
}

function TinglePickerModal({ items, selectedId, accentColor, title, noneLabel, onSelect, onClose }: {
  items: TingleCol[]; selectedId: string | null; accentColor: string; title: string; noneLabel: string
  onSelect: (id: string | null) => void
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
            <div key={item.id} onClick={() => onSelect(item.id)} style={{
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
  const [uniPickerOpen, setUniPickerOpen] = useState(false)
  const [scenePickerOpen, setScenePickerOpen] = useState(false)
  const userName = useDisplayName()

  useEffect(() => {
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
    ]).then(([c, all]) => { setCol(c); setAllTingle(all) }).catch(() => {})
    setSelectedUniverseId(localStorage.getItem(`tg_uni_${id}`) ?? null)
    setSelectedSceneId(localStorage.getItem(`tg_scene_${id}`) ?? null)
  }, [id])

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

  if (!col) return <div className="tingle-empty">불러오는 중...</div>

  const mainChar = col.characters[0]
  const charNames = col.characters.map(c => c.name)
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
      const chosen = openings[openingIdx]?.content
      const scenarioDescription = buildScenario()
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'story',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
        ...(scenarioDescription ? { scenarioDescription } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
      {uniPickerOpen && (
        <TinglePickerModal items={universes} selectedId={selectedUniverseId} accentColor="#a78bfa"
          title="서사 선택" noneLabel="서사 없음" onSelect={handleSelectUniverse} onClose={() => setUniPickerOpen(false)} />
      )}
      {scenePickerOpen && (
        <TinglePickerModal items={scenes} selectedId={selectedSceneId} accentColor="#06bfd6"
          title="테마 선택" noneLabel="테마 없음" onSelect={handleSelectScene} onClose={() => setScenePickerOpen(false)} />
      )}

      {showEdit && (
        <CollectionEditModal
          collection={{ id: col.id, title: col.title, tags: col.tags ?? [], description: col.description ?? '', coverImageUrl: col.coverImageUrl ?? '' }}
          label="캐릭터"
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
                <div style={{ fontSize: 11, color: '#ff5776', fontWeight: 700 }}>캐릭터</div>
              </div>
              <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                onClick={() => setShowEdit(true)}>✏ 정보</button>
            </div>
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tingle-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {mainChar?.additionalInfo?.trim() && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">캐릭터 설정</h2>
              <div className="tingle-intro-box">
                <div className="tingle-desc" style={{ whiteSpace: 'pre-wrap' }}>
                  {replaceDisplayPlaceholders(mainChar.additionalInfo, userName, charNames)}
                </div>
              </div>
            </div>
          )}

          {openings.length > 0 && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">도입부</h2>
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
                <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', userName, charNames)} />
              </div>
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

          {error && <div style={{ padding: '0 16px 8px', fontSize: 12, color: '#ff6b8a' }}>{error}</div>}
          <div style={{ height: 80 }} />
        </div>

        <div className="tingle-cta">
          <button className="tingle-cta-btn" disabled={creating || !mainChar} onClick={() => setPersonaOpen(true)}>
            {creating ? '생성 중...' : '대화 시작'}
          </button>
        </div>
      </div>
    </>
  )
}
