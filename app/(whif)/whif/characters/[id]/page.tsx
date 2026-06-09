'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import PersonaSelectModal from '@/components/ui/PersonaSelectModal'

interface Opening { id: string; title: string; content: string }
interface Character {
  id: string; name: string; gender: string; avatarUrl: string | null; tags: string[]
  additionalInfo: string; openingMessage: string; safetyLevel: string
  openingMessages?: Opening[]; collection?: { id: string; title: string } | null
}

export default function CharacterDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [char, setChar] = useState<Character | null>(null)
  const [allChars, setAllChars] = useState<Character[]>([])
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const list: Character[] = await api.get('/api/characters?isWhif=true')
      setAllChars(list)
      setChar(list.find(c => c.id === id) ?? null)
    })()
  }, [id])

  if (!char) return <div className="whif-empty">불러오는 중...</div>

  const openings = char.openingMessages?.length
    ? char.openingMessages
    : char.openingMessage?.trim()
      ? [{ id: 'default', title: '기본 도입부', content: char.openingMessage }]
      : []
  const nsfw = char.safetyLevel === 'relaxed'
  const personaCandidates = allChars.filter(c => c.collection?.id === char.collection?.id && c.id !== char.id)

  const handlePersonaSelect = async (personaCharId: string | null, newName?: string) => {
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newName?.trim()) {
        const p = await api.post('/api/characters', { name: newName.trim() })
        personaId = p.id
      }
      const chosen = openings[openingIdx]?.content
      const resp = await api.post('/api/conversations', {
        title: char.name,
        characterIds: [char.id],
        mode: 'roleplay',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
      {personaOpen && (
        <PersonaSelectModal
          candidates={personaCandidates as any}
          loading={creating}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newName) => handlePersonaSelect(charId, newName)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="whif-scroll">
          {/* Cover */}
          <div style={{ position: 'relative' }}>
            {char.avatarUrl
              ? <img className="whif-cover" src={char.avatarUrl} alt="" />
              : <div className="whif-cover" />}
            <button className="whif-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          {/* Name + Badge + Tags */}
          <div className="whif-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--w-ink)' }}>{char.name}</h1>
              {nsfw && <span className="whif-chip" style={{ background: '#7f1d1d', color: '#fecaca', flexShrink: 0 }}>19금</span>}
            </div>
            {char.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {char.tags.map(t => <span key={t} className="whif-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {/* 캐릭터 소개 */}
          {char.additionalInfo?.trim() && (
            <div className="whif-section" style={{ paddingTop: 0 }}>
              <h2 className="whif-section-title">캐릭터 소개</h2>
              <p style={{ color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{char.additionalInfo}</p>
            </div>
          )}

          {/* 시작 상황 */}
          {openings.length > 0 && (
            <div className="whif-section" style={{ paddingTop: 0 }}>
              <h2 className="whif-section-title">시작 상황</h2>
              {openings.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {openings.map((op, i) => (
                    <button key={op.id} className={`whif-chip ${i === openingIdx ? 'sel' : ''}`}
                      style={{ border: 'none', cursor: 'pointer' }} onClick={() => setOpeningIdx(i)}>
                      {op.title}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: 10, padding: 14 }}>
                <p style={{ margin: 0, color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {openings[openingIdx]?.content}
                </p>
              </div>
            </div>
          )}

          {/* 소속 작품 */}
          {char.collection && (
            <div className="whif-section" style={{ paddingTop: 0 }}>
              <h2 className="whif-section-title">소속 작품</h2>
              <button onClick={() => router.push(`/whif/universes/${char.collection!.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--w-surface)',
                  border: '1px solid var(--w-line)', borderRadius: 10, padding: '10px 14px',
                  color: 'var(--w-ink)', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                <span style={{ fontSize: 18 }}>🌐</span>
                <span style={{ fontWeight: 600 }}>{char.collection.title}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--w-ink-soft)' }}>›</span>
              </button>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        {/* 하단 고정 채팅 하기 */}
        <div className="whif-cta">
          <button className="whif-cta-btn" onClick={() => setPersonaOpen(true)}>채팅 하기</button>
        </div>
      </div>
    </>
  )
}
