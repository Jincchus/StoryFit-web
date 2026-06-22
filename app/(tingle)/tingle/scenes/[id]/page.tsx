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

function SelectList({ items, selectedId, accentColor, noneLabel, onSelect }: {
  items: TingleCol[]; selectedId: string | null; accentColor: string; noneLabel: string
  onSelect: (id: string | null) => void
}) {
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
        <button key={item.id} onClick={() => onSelect(item.id)} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          borderRadius: 8, cursor: 'pointer', textAlign: 'left', appearance: 'none',
          border: `1.5px solid ${selectedId === item.id ? accentColor : 'var(--tg-line)'}`,
          background: selectedId === item.id ? `${accentColor}18` : 'var(--tg-surface)',
        }}>
          {item.coverImageUrl && <img src={item.coverImageUrl} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />}
          <span style={{ fontSize: 12, fontWeight: 600, color: selectedId === item.id ? accentColor : 'var(--tg-ink)' }}>{item.title}</span>
        </button>
      ))}
      {items.length === 0 && <div style={{ fontSize: 12, color: 'var(--tg-ink-soft)', padding: '4px 0' }}>가져온 항목이 없습니다.</div>}
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
  const userName = useDisplayName()

  useEffect(() => {
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
    ]).then(([c, all]) => { setCol(c); setAllTingle(all) }).catch(() => {})
    setSelectedCharId(localStorage.getItem(`tg_char_scene_${id}`) ?? null)
    setSelectedUniverseId(localStorage.getItem(`tg_uni_scene_${id}`) ?? null)
  }, [id])

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
      const resp = await api.post('/api/conversations', {
        title: `${selectedChar!.title} × ${col.title}`,
        characterIds: [activeChar.id],
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
              <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                onClick={() => setShowEdit(true)}>✏ 정보</button>
            </div>
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="tingle-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {/* 테마 설명 */}
          {(col.description?.trim() || mainChar?.additionalInfo?.trim()) && (
            <div className="tingle-section" style={{ paddingTop: 0 }}>
              <h2 className="tingle-section-title">테마 설명</h2>
              <div className="tingle-intro-box">
                <div className="tingle-desc" style={{ whiteSpace: 'pre-wrap' }}>
                  {replaceDisplayPlaceholders(mainChar?.additionalInfo || col.description || '', userName, charNames)}
                </div>
              </div>
            </div>
          )}

          {/* 캐릭터 선택 */}
          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#ff5776' }}>캐릭터 선택</h2>
            <SelectList items={characters} selectedId={selectedCharId} accentColor="#ff5776" noneLabel="캐릭터 없음" onSelect={handleSelectChar} />
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
            <SelectList items={universes} selectedId={selectedUniverseId} accentColor="#a78bfa" noneLabel="서사 없음" onSelect={handleSelectUniverse} />
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
