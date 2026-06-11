'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Opening { id: string; title: string; content: string }
interface Character {
  id: string; name: string; gender: string; avatarUrl: string | null; tags: string[]
  additionalInfo: string; openingMessage: string; safetyLevel: string
  openingMessages?: Opening[]; collection?: { id: string; title: string } | null
  relatedImages?: string[]
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
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
  const [imgIdx, setImgIdx] = useState(0)
  const [existingConvs, setExistingConvs] = useState<any[]>([])
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)

  useEffect(() => {
    (async () => {
      const list: Character[] = await api.get('/api/characters?isWhif=true')
      setAllChars(list)
      setChar(list.find(c => c.id === id) ?? null)
    })()
  }, [id])

  useEffect(() => {
    if (id) {
      api.get(`/api/conversations?characterId=${id}`).then(setExistingConvs).catch(() => setExistingConvs([]))
    }
  }, [id])

  const handleCtaClick = () => {
    if (existingConvs.length > 0) {
      setShowNewChatConfirm(true)
    } else {
      setPersonaOpen(true)
    }
  }

  if (!char) return <div className="whif-empty">불러오는 중...</div>

  const openings = char.openingMessages?.length
    ? char.openingMessages
    : char.openingMessage?.trim()
      ? [{ id: 'default', title: '기본 도입부', content: char.openingMessage }]
      : []
  const nsfw = char.safetyLevel === 'relaxed'
  const personaCandidates = allChars.filter(c => c.collection?.id === char.collection?.id && c.id !== char.id)
  const relatedImgs = (char.relatedImages ?? []).filter(u => !getYouTubeId(u))
  const relatedVideo = (char.relatedImages ?? []).find(u => getYouTubeId(u))

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData) => {
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newPersona) {
        const p = await api.post('/api/characters', {
          name: newPersona.name,
          gender: newPersona.gender,
          additionalInfo: newPersona.additionalInfo,
        })
        personaId = p.id
      }
      const chosen = openings[openingIdx]?.content
      const resp = await api.post('/api/conversations', {
        title: char.name,
        characterIds: [char.id],
        mode: 'story',
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
      {showNewChatConfirm && (
        <ConfirmDialog
          message="이미 진행 중인 대화방이 있습니다. 새로운 대화방을 만드시겠습니까? (기존 대화방은 하단의 진행 중인 대화 목록에서 이어갈 수 있습니다.)"
          confirmLabel="새 대화 시작"
          confirmVariant="primary"
          onConfirm={() => { setShowNewChatConfirm(false); setPersonaOpen(true) }}
          onCancel={() => setShowNewChatConfirm(false)}
        />
      )}

      {personaOpen && (
        <WhifPersonaModal
          candidates={personaCandidates as any}
          loading={creating}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
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
              <p style={{ color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{replaceDisplayPlaceholders(char.additionalInfo, '나', char.name)}</p>
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
              <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: 10, padding: 14, color: 'var(--w-ink-soft)', lineHeight: 1.6, fontSize: 14 }}>
                <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', '나', char.name)} />
              </div>
            </div>
          )}

          {/* 관련 콘텐츠 */}
          {(relatedImgs.length > 0 || relatedVideo) && (
            <div className="whif-section" style={{ paddingTop: 0 }}>
              <h2 className="whif-section-title">관련 콘텐츠</h2>
              {relatedImgs.length > 0 && (
                <div>
                  <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12 }}>
                    <img
                      src={relatedImgs[imgIdx]}
                      alt=""
                      style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }}
                    />
                    {relatedImgs.length > 1 && (
                      <>
                        <button onClick={() => setImgIdx(i => (i - 1 + relatedImgs.length) % relatedImgs.length)}
                          style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                            background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%',
                            width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ‹
                        </button>
                        <button onClick={() => setImgIdx(i => (i + 1) % relatedImgs.length)}
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', borderRadius: '50%',
                            width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ›
                        </button>
                      </>
                    )}
                  </div>
                  {relatedImgs.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                      {relatedImgs.map((_, i) => (
                        <button key={i} onClick={() => setImgIdx(i)}
                          style={{ width: i === imgIdx ? 18 : 6, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer',
                            background: i === imgIdx ? 'var(--w-accent)' : 'var(--w-line)', padding: 0, transition: 'all 0.2s' }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {relatedVideo && (
                <div style={{ marginTop: relatedImgs.length > 0 ? 14 : 0, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${getYouTubeId(relatedVideo)}`}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
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

          {existingConvs.length > 0 && (
            <div className="whif-section" style={{ paddingTop: 0 }}>
              <h2 className="whif-section-title">진행 중인 대화</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingConvs.map(c => (
                  <div key={c.id} className="whif-card" style={{ cursor: 'pointer', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: 10 }} onClick={() => router.push(`/conversations/${c.id}`)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--w-ink)' }}>{c.title}</div>
                      {c.messages?.[0]?.content && (
                        <div style={{ color: 'var(--w-ink-soft)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.messages[0].content}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--w-ink-soft)', fontSize: 11, flexShrink: 0, marginLeft: 10 }}>{formatDate(c.updatedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        {/* 하단 고정 채팅 하기 */}
        <div className="whif-cta">
          <button className="whif-cta-btn" onClick={handleCtaClick}>채팅 하기</button>
        </div>
      </div>
    </>
  )
}
