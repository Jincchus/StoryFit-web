'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import PixelAvatar from '@/components/ui/PixelAvatar'
import { parseNovelBlocks } from '@/lib/parseBlocks'

interface Msg {
  id: string
  role: string
  content: string
  characterId?: string | null
  createdAt: string
}

interface Conv {
  id: string
  title: string
  mode: string
  characters: { character: { id: string; name: string; avatarUrl?: string | null } }[]
  personaCharacter?: { id: string; name: string; avatarUrl?: string | null } | null
  messages: Msg[]
}

interface BranchInfo {
  id: string
  version: number
  branchDescription: string
  branchFromMessageId: string | null
  rootConversationId: string | null
}

function renderContent(text: string) {
  const lines = text.split('\n').filter(Boolean)
  return lines.map((line, i) => {
    const dialogue = line.match(/^(.*?)\s*:\s*"(.*)"$/)
    const thought = line.match(/^(.*?)\s*:\s*'(.*)'$/)
    if (dialogue) return (
      <p key={i} style={{ margin: '4px 0' }}>
        <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{dialogue[1]}</span>
        {' '}
        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>"{dialogue[2]}"</span>
      </p>
    )
    if (thought) return (
      <p key={i} style={{ margin: '4px 0', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
        <span style={{ fontSize: 11 }}>{thought[1]}</span> '{thought[2]}'
      </p>
    )
    const parts = line.split(/(\*[^*]+\*|"[^"]*")/g)
    return (
      <p key={i} style={{ margin: '4px 0' }}>
        {parts.map((part, j) => {
          if (part.startsWith('*') && part.endsWith('*')) return <em key={j} style={{ color: 'var(--ink-soft)' }}>{part.slice(1, -1)}</em>
          if (part.startsWith('"') && part.endsWith('"')) return <strong key={j}>{part}</strong>
          return <span key={j}>{part}</span>
        })}
      </p>
    )
  })
}

function parseStoryChoices(content: string): { body: string; choices: string[] } {
  const lines = content.split('\n')
  let sepIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '---') { sepIdx = i; break }
  }
  if (sepIdx === -1) return { body: content, choices: [] }
  const body = lines.slice(0, sepIdx).join('\n').trim()
  const choices = lines.slice(sepIdx + 1).map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean)
  return { body, choices }
}

function NarrationLine({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 6 }} />
        const parts = line.split(/(\*[^*]+\*)/)
        return (
          <p key={i} style={{ margin: '0 0 6px', fontSize: 13, lineHeight: 1.9, color: 'var(--ink)' }}>
            {parts.map((p, j) =>
              p.startsWith('*') && p.endsWith('*')
                ? <em key={j} style={{ color: 'var(--ink-soft)' }}>{p.slice(1, -1)}</em>
                : <span key={j}>{p}</span>
            )}
          </p>
        )
      })}
    </>
  )
}

export default function LibraryReadPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [conv, setConv] = useState<Conv | null>(null)
  const [branchMsgId, setBranchMsgId] = useState<string | null>(null)
  const [branchDesc, setBranchDesc] = useState('')
  const [branching, setBranching] = useState(false)
  const [expandedChoices, setExpandedChoices] = useState<Set<string>>(new Set())
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get(`/api/conversations/${id}`).then(setConv)
    api.get(`/api/conversations/${id}/branches`).then(setBranches).catch(() => {})
  }, [id])

  const charMap = Object.fromEntries(
    (conv?.characters ?? []).map(cc => [cc.character.id, cc.character])
  )

  const saveEdit = async (msgId: string) => {
    if (!editContent.trim()) return
    await api.patch(`/api/conversations/${id}/messages`, { messageId: msgId, content: editContent.trim() })
    setConv(c => c ? { ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, content: editContent.trim() } : m) } : c)
    setEditingId(null)
  }

  const handleBranch = async () => {
    if (!branchMsgId || branching) return
    setBranching(true)
    try {
      const branch = await api.post(`/api/conversations/${id}/branch`, {
        branchFromMessageId: branchMsgId,
        description: branchDesc.trim(),
      })
      router.push(`/conversations/${branch.id}`)
    } finally {
      setBranching(false)
    }
  }

  if (!conv) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div className="tiny muted">불러오는 중...</div>
    </div>
  )

  const isStory = conv.mode === 'story'
  const useProseLayout = isStory
  const personaName = conv.personaCharacter?.name?.toLowerCase() ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.back()}>← 서재</button>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{conv.title}</div>
      </div>

      {branches.length > 1 && (
        <div style={{
          display: 'flex', gap: 4, padding: '6px 14px',
          borderBottom: '1px solid var(--hairline)',
          overflowX: 'auto', flexShrink: 0,
        }}>
          {branches.map(b => {
            const isCurrent = b.id === id
            return (
              <button
                key={b.id}
                className={`btn ${isCurrent ? 'primary' : 'ghost'}`}
                style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}
                title={b.branchDescription || undefined}
                onClick={() => !isCurrent && router.push(`/library/${b.id}`)}
              >
                v{b.version}{b.branchDescription ? ` · ${b.branchDescription}` : ''}
              </button>
            )
          })}
        </div>
      )}

      <div className="scroll" style={{ flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {conv.messages.map((msg, idx) => {
          const isUser = msg.role === 'user'
          const char = msg.characterId ? charMap[msg.characterId] : conv.characters[0]?.character
          const isLast = idx === conv.messages.length - 1

          if (useProseLayout) {
            if (isUser) {
              return (
                <div key={msg.id} style={{
                  borderLeft: '2px solid var(--lavender)',
                  padding: '6px 10px',
                  background: 'rgba(124, 79, 192, 0.07)',
                  borderRadius: '0 4px 4px 0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ fontSize: 9, color: 'var(--lavender)', letterSpacing: '1.5px', fontFamily: 'monospace' }}>SCENE</div>
                    <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px', opacity: 0.6 }} onClick={() => { setEditingId(msg.id); setEditContent(msg.content) }}>✏</button>
                  </div>
                  {editingId === msg.id ? (
                    <div className="vstack" style={{ gap: 4 }}>
                      <textarea className="field" rows={3} style={{ fontSize: 12 }} value={editContent} onChange={e => setEditContent(e.target.value)} autoFocus />
                      <div className="hstack" style={{ gap: 4 }}>
                        <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => saveEdit(msg.id)}>저장</button>
                        <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setEditingId(null)}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic', lineHeight: 1.6 }}>{msg.content}</div>
                  )}
                </div>
              )
            }

            const storyParsed = isStory ? parseStoryChoices(msg.content) : null
            const bodyText = storyParsed ? storyParsed.body : msg.content
            const blocks = parseNovelBlocks(bodyText)
            const isExpanded = expandedChoices.has(msg.id)

            return (
              <div key={msg.id}>
                {blocks.map((block, i) => {
                  if (block.type === 'narration') {
                    return <NarrationLine key={i} text={block.text} />
                  }
                  const rawSpeaker = block.speaker?.replace(/^\[|\]$/g, '').trim() ?? char?.name ?? ''
                  const speakerChar = conv.characters.find(cc =>
                    cc.character.name.toLowerCase() === rawSpeaker.toLowerCase()
                  )?.character ?? (personaName && rawSpeaker.toLowerCase() === personaName ? conv.personaCharacter : null)
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--hairline)', flexShrink: 0 }}>
                          {speakerChar?.avatarUrl
                            ? <img src={speakerChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            : <PixelAvatar kind="custom" size={20} />
                          }
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>{rawSpeaker}</span>
                      </div>
                      <div style={{ paddingLeft: 26, fontSize: 13, lineHeight: 1.8, color: 'var(--ink)' }}>
                        {block.type === 'thought'
                          ? <em style={{ color: 'var(--ink-soft)' }}>'{block.text}'</em>
                          : <span>"{block.text}"</span>
                        }
                      </div>
                    </div>
                  )
                })}

                {isStory && storyParsed && storyParsed.choices.length > 0 && (
                  <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                    <button
                      className="btn ghost"
                      style={{ width: '100%', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 0 }}
                      onClick={() => setExpandedChoices(prev => {
                        const next = new Set(prev)
                        next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id)
                        return next
                      })}
                    >
                      <span style={{ fontSize: 10, color: 'var(--lavender)', fontFamily: 'monospace', letterSpacing: 1 }}>
                        CHOICES <span style={{ color: 'var(--ink-soft)' }}>{storyParsed.choices.length}개</span>
                      </span>
                      <span style={{ fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isExpanded && (
                      <div style={{ padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {storyParsed.choices.map((choice, ci) => (
                          <div key={ci} style={{ fontSize: 11, color: 'var(--ink-soft)', padding: '3px 0' }}>
                            {ci + 1}. {choice}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px', opacity: 0.6 }} onClick={() => { setEditingId(msg.id); setEditContent(msg.content) }}>✏ 편집</button>
                  {!isLast && (
                    <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px', opacity: 0.6 }} onClick={() => { setBranchMsgId(msg.id); setBranchDesc('') }}>⑂ 분기</button>
                  )}
                </div>
                {editingId === msg.id && (
                  <div className="vstack" style={{ gap: 4, marginTop: 6 }}>
                    <textarea className="field" rows={5} style={{ fontSize: 13 }} value={editContent} onChange={e => setEditContent(e.target.value)} autoFocus />
                    <div className="hstack" style={{ gap: 4 }}>
                      <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => saveEdit(msg.id)}>저장</button>
                      <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setEditingId(null)}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          // multiStory — 기존 버블 레이아웃 유지
          const speaker = isUser ? conv.personaCharacter : char
          return (
            <div key={msg.id} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid var(--hairline)' }}>
                  {speaker?.avatarUrl
                    ? <img src={speaker.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <PixelAvatar kind={isUser ? 'ai' : 'custom'} size={32} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4, fontWeight: 600 }}>
                    {speaker?.name ?? (isUser ? '유저' : '캐릭터')}
                  </div>
                  {editingId === msg.id ? (
                    <div className="vstack" style={{ gap: 4 }}>
                      <textarea className="field" rows={4} style={{ fontSize: 13 }} value={editContent} onChange={e => setEditContent(e.target.value)} autoFocus />
                      <div className="hstack" style={{ gap: 4 }}>
                        <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => saveEdit(msg.id)}>저장</button>
                        <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setEditingId(null)}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      background: isUser ? 'var(--bubble-you)' : 'var(--bubble-other)',
                      color: isUser ? 'var(--bubble-you-text)' : 'var(--ink)',
                      borderRadius: 'var(--radius)',
                      padding: '10px 14px',
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}>
                      {renderContent(msg.content)}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 6, marginLeft: 42, display: 'flex', gap: 4 }}>
                <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px', opacity: 0.6 }} onClick={() => { setEditingId(msg.id); setEditContent(msg.content) }}>✏ 편집</button>
                {!isUser && !isLast && (
                  <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px', opacity: 0.6 }} onClick={() => { setBranchMsgId(msg.id); setBranchDesc('') }}>⑂ 분기</button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {branchMsgId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 20,
        }}>
          <div className="win" style={{ width: 'min(360px, 100%)', maxWidth: '100%' }}>
            <div className="win-title">
              <div className="win-title-l"><span>⑂ 분기 생성</span></div>
              <div className="win-controls"><button onClick={() => setBranchMsgId(null)}>×</button></div>
            </div>
            <div className="win-body vstack" style={{ gap: 10 }}>
              <div className="tiny muted">이 시점부터 새로운 흐름으로 대화를 이어갑니다.<br />원본 이야기는 서재에 그대로 남아요.</div>
              <input
                className="field"
                placeholder="분기 설명 (선택) — 예: 다른 선택을 했다면?"
                value={branchDesc}
                onChange={e => setBranchDesc(e.target.value)}
                autoFocus
              />
              <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn ghost" onClick={() => setBranchMsgId(null)}>취소</button>
                <button className="btn primary" onClick={handleBranch} disabled={branching}>
                  {branching ? '생성 중...' : '✦ 분기 생성'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
