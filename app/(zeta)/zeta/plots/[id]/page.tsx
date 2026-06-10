'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'

interface Opening { id: string; title: string; content: string }
interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
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

function formatCount(n: number) {
  return n >= 10000 ? `${Math.floor(n / 10000)}만` : n >= 1000 ? `${(n / 1000).toFixed(1)}천` : String(n)
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

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  useEffect(() => {
    const charId = col?.characters?.[0]?.id
    if (!charId) return
    api.get(`/api/conversations?characterId=${charId}`).then(setExistingConvs).catch(() => setExistingConvs([]))
  }, [col])

  if (!col) return <div className="zeta-empty">불러오는 중...</div>

  const meta = col.zetaMeta ?? {}
  const mainChar = col.characters[0]
  const openings: Opening[] = mainChar?.openingMessages?.length
    ? mainChar.openingMessages
    : mainChar?.openingMessage?.trim()
      ? [{ id: 'default', title: '기본 도입부', content: mainChar.openingMessage }]
      : []
  const creator = meta.creator ?? null
  const chatProfile = Array.isArray(meta.chatProfiles) ? meta.chatProfiles[0] : null
  const personaDefaults = chatProfile
    ? [chatProfile.summary, chatProfile.description].filter(Boolean).join('\n')
    : ''

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newPersona) {
        const p = await api.post('/api/characters', {
          name: newPersona.name, gender: newPersona.gender, additionalInfo: newPersona.additionalInfo,
        })
        personaId = p.id
      }
      const chosen = openings[openingIdx]?.content
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'story',
        personaCharacterId: personaId,
        ...(col.description ? { scenarioDescription: col.description } : {}),
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
        <WhifPersonaModal
          candidates={[]}
          loading={creating}
          defaultSettings={personaDefaults}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="zeta-scroll">
          <div className="zeta-cover-wrap">
            {col.coverImageUrl ? <img className="zeta-cover" src={col.coverImageUrl} alt="" /> : <div className="zeta-cover" />}
            <button className="zeta-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
            {creator?.username && <div className="zeta-cover-handle">@{creator.username}</div>}
          </div>

          <div className="zeta-section">
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: 'var(--z-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {col.title}
              {meta.verified && <span title="인증됨" style={{ color: 'var(--z-accent)', fontSize: 16 }}>✓</span>}
            </h1>
            {meta.shortDescription && <p style={{ color: 'var(--z-ink-soft)', margin: '0 0 10px', fontSize: 14 }}>{meta.shortDescription}</p>}
            {meta.interactionCount > 0 && (
              <div className="zeta-chip" style={{ marginBottom: 10 }}>💬 {formatCount(meta.interactionCount)}</div>
            )}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="zeta-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {col.characters.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">캐릭터</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.characters.map(c => (
                  <div key={c.id} className="zeta-charcard" style={{ alignItems: 'flex-start' }}>
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--z-line)' }} />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      {c.additionalInfo?.trim() && (
                        <div style={{ color: 'var(--z-ink-soft)', fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {c.additionalInfo
                            .replace(/\{\{user\}\}/gi, '나')
                            .replace(/\{\{char\}\}/gi, c.name)}
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
                <NovelText text={col.description
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
              </div>
            </div>
          )}

          {openings.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">인트로</h2>
              {openings.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {openings.map((op, i) => (
                    <button key={op.id} className="zeta-chip"
                      style={{ border: 'none', cursor: 'pointer', background: i === openingIdx ? 'var(--z-accent)' : 'var(--z-surface-2)', color: i === openingIdx ? '#fff' : 'var(--z-ink-soft)' }}
                      onClick={() => setOpeningIdx(i)}>{op.title}</button>
                  ))}
                </div>
              )}
              <div className="zeta-intro-box">
                <NovelText text={(openings[openingIdx]?.content ?? '')
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
              </div>
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
                          {m.sender === 'USER' ? '나' : (m.senderName || mainChar?.name || '캐릭터')}
                        </div>
                        <NovelText text={String(m.content ?? '')
                          .replace(/\{\{user\}\}/gi, '나')
                          .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {creator && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">크리에이터</h2>
              {meta.creatorComment && (
                <p style={{ color: 'var(--z-ink-soft)', lineHeight: 1.6, margin: '0 0 10px', fontSize: 13, whiteSpace: 'pre-wrap' }}>{meta.creatorComment}</p>
              )}
              <div className="zeta-creator">
                {creator.profileImageUrl && <img src={creator.profileImageUrl} alt="" />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{creator.nickname}</div>
                  {creator.username && <div style={{ color: 'var(--z-ink-soft)', fontSize: 12 }}>@{creator.username}</div>}
                </div>
              </div>
              {(meta.createdAt || meta.updatedAt) && (
                <div style={{ color: 'var(--z-ink-soft)', fontSize: 11, marginTop: 8 }}>
                  {meta.createdAt && `출시일 ${formatDate(meta.createdAt)}`}
                  {meta.updatedAt && ` / 수정일 ${formatDate(meta.updatedAt)}`}
                </div>
              )}
            </div>
          )}

          {Array.isArray(meta.lorebooks) && meta.lorebooks.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">로어북</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {meta.lorebooks.map((lb: any, i: number) => (
                  <div key={i} className="zeta-charcard" style={{ cursor: 'default' }}>
                    <span style={{ fontWeight: 700 }}>📒 {lb.name ?? lb.title ?? `로어북 ${i + 1}`}</span>
                  </div>
                ))}
              </div>
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
          <button className="zeta-cta-btn" onClick={() => setPersonaOpen(true)} disabled={!mainChar}>
            {existingConvs.length > 0 ? '새로운 대화 시작하기' : '대화 시작하기'}
          </button>
        </div>
      </div>
    </>
  )
}
