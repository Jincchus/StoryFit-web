'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { AI_MODELS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import NovelText from '@/components/ui/NovelText'
import AiPill from '@/components/ui/AiPill'
import type { AIProvider } from '@/types'

interface Msg { id: string; role: string; content: string; aiModel?: string }
interface Conv {
  id: string; title: string; currentAI: string; coreMemory: string; statusTimeline: string
  characters: { character: { id: string; name: string; kind: string; avatarUrl?: string } }[]
  userPersona?: { id: string; name: string } | null
  messages: Msg[]
}
interface LbEntry { id: string; keyword: string[]; content: string; priority: number; scanDepth: number }
interface Persona { id: string; name: string; description: string }

export default function ChatPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [conv, setConv] = useState<Conv | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [streaming, setStreaming] = useState('')
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState('')
  const [model, setModel] = useState<AIProvider>('gemini')
  const [showPanel, setShowPanel] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [lorebooks, setLorebooks] = useState<LbEntry[]>([])
  const [lorebookAdd, setLorebookAdd] = useState(false)
  const [lorebookEditId, setLorebookEditId] = useState<string | null>(null)
  const [lbForm, setLbForm] = useState({ keywords: '', content: '', priority: 0, scanDepth: 5 })
  const logRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const loadConv = useCallback(async () => {
    const data: Conv = await api.get(`/api/conversations/${params.id}`)
    setConv(data)
    setMessages(data.messages)
    setModel(data.currentAI as AIProvider)
  }, [params.id])

  useEffect(() => { loadConv() }, [loadConv])

  useEffect(() => {
    api.get(`/api/lorebooks?conversationId=${params.id}`).then(setLorebooks).catch(() => {})
  }, [params.id])

  useEffect(() => {
    api.get('/api/personas').then(setPersonas).catch(() => {})
  }, [])

  const handleAddLorebook = async () => {
    const keyword = lbForm.keywords.split(',').map(k => k.trim()).filter(Boolean)
    if (!keyword.length || !lbForm.content.trim()) return
    try {
      const entry = await api.post('/api/lorebooks', {
        keyword, content: lbForm.content, priority: lbForm.priority, scanDepth: lbForm.scanDepth,
        conversationId: params.id, scope: 'conversation', scopeId: params.id,
      })
      setLorebooks(prev => [...prev, entry])
      setLbForm({ keywords: '', content: '', priority: 0 })
      setLorebookAdd(false)
    } catch {}
  }

  const handlePatchLorebook = async (id: string, data: Partial<LbEntry>) => {
    try {
      const updated = await api.patch(`/api/lorebooks/${id}`, data)
      setLorebooks(prev => prev.map(e => e.id === id ? updated : e))
      setLorebookEditId(null)
    } catch {}
  }

  const handleDeleteLorebook = async (id: string) => {
    try {
      await api.delete(`/api/lorebooks/${id}`)
      setLorebooks(prev => prev.filter(e => e.id !== id))
    } catch {}
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages.length, streaming, typing])

  const send = async (content: string) => {
    if (!content.trim() || typing) return
    setText('')
    const userMsg: Msg = { id: 'tmp-' + Date.now(), role: 'user', content }
    setMessages(prev => [...prev, userMsg])
    setTyping(true)
    setStreaming('')

    const ctrl = new AbortController()
    abortRef.current = ctrl

    setSendError('')
    try {
      const res = await api.streamChat(params.id, content, ctrl.signal)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSendError(data.error || 'AI 응답 생성에 실패했습니다.')
        setTyping(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const json = JSON.parse(line.slice(6))
            if (json.text) setStreaming(prev => prev + json.text)
            if (json.done) {
              setStreaming('')
              await loadConv()
            }
            if (json.error) {
              setStreaming('')
              setSendError(json.error)
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setStreaming('')
        setSendError('연결이 끊어졌습니다. 다시 시도해주세요.')
      }
    } finally {
      setTyping(false)
      abortRef.current = null
    }
  }

  const stopStream = () => { abortRef.current?.abort(); setTyping(false); setStreaming('') }

  const handleDelete = async (msgId: string) => {
    await api.delete(`/api/conversations/${params.id}/messages`, { messageId: msgId })
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  const handleRegenerate = async () => {
    if (typing) return
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) return
    await handleDelete(lastAssistant.id)
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (lastUser) await send(lastUser.content)
  }

  const startEdit = (id: string, content: string) => { setEditingId(id); setEditText(content) }

  const saveEdit = async () => {
    if (!editText.trim() || !editingId) return
    const idx = messages.findIndex(m => m.id === editingId)
    const toDelete = messages.slice(idx)
    for (const m of toDelete) {
      await api.delete(`/api/conversations/${params.id}/messages`, { messageId: m.id })
    }
    setMessages(prev => prev.slice(0, idx))
    setEditingId(null)
    await send(editText.trim())
  }

  const handleModelChange = async (id: AIProvider) => {
    setModel(id)
    await api.patch(`/api/conversations/${params.id}`, { currentAI: id })
  }

  const handleTitleSave = async () => {
    if (!titleInput.trim() || !conv) return
    await api.patch(`/api/conversations/${params.id}`, { title: titleInput.trim() })
    setConv(c => c ? { ...c, title: titleInput.trim() } : c)
    setEditingTitle(false)
  }

  const handlePersonaChange = async (personaId: string | null) => {
    await api.patch(`/api/conversations/${params.id}`, { userPersonaId: personaId })
    const found = personas.find(p => p.id === personaId) ?? null
    setConv(c => c ? { ...c, userPersona: found ? { id: found.id, name: found.name } : null } : c)
  }

  const handleCoreMemory = async (value: string) => {
    setConv(c => c ? { ...c, coreMemory: value } : c)
    await api.patch(`/api/conversations/${params.id}`, { coreMemory: value })
  }

  const handleStatusTimeline = async (value: string) => {
    setConv(c => c ? { ...c, statusTimeline: value } : c)
    await api.patch(`/api/conversations/${params.id}`, { statusTimeline: value })
  }

  if (!conv) return null
  const char = conv.characters[0]?.character
  if (!char) return null

  const lastMsg = messages[messages.length - 1]
  const isLastAssistant = lastMsg?.role === 'assistant'

  return (
    <Win title={`채팅 — ${char.name}`} icon={PixelIcons.chat}>
      <div className="vstack" style={{ gap: 8, flex: 1, minHeight: 0 }}>
        <div className="chat-header spread">
          <div className="hstack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
            <button className="btn ghost" onClick={() => router.push('/')} style={{ padding: '2px 6px', flexShrink: 0 }}>←</button>
            <div className="thumb" style={{ width: 34, height: 34, background: 'var(--lavender)', border: '1.5px solid var(--chrome-border)', display: 'grid', placeItems: 'center', imageRendering: 'pixelated', borderRadius: 'var(--radius)', flexShrink: 0 }}>
              {char.avatarUrl
                ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : <PixelAvatar kind={char.kind as any} size={30} />
              }
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {char.name}
                {conv.userPersona && <span className="muted" style={{ fontWeight: 400 }}> · {conv.userPersona.name}</span>}
              </div>
              <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                턴 {Math.floor(messages.length / 2)}
                {conv.statusTimeline && <span> · {conv.statusTimeline}</span>}
              </div>
            </div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 4 }}>
            <AiPill modelId={model} onChange={handleModelChange} />
            <button
              className={`btn ${showPanel ? 'primary' : 'ghost'}`}
              style={{ padding: '3px 7px', fontSize: 10 }}
              onClick={() => setShowPanel(p => !p)}
            >⚙</button>
          </div>
        </div>

        <div className="chat-layout">
          <div className="chat-main">
            <div className="chatlog" ref={logRef}>
              {messages.map(m => {
                const isYou = m.role === 'user'
                const ai = AI_MODELS.find(x => x.id === m.aiModel) ?? AI_MODELS[0]
                const isLast = m.id === lastMsg?.id
                const isEditing = editingId === m.id

                return (
                  <div
                    key={m.id}
                    className={`msg-wrap ${isYou ? 'you' : ''}`}
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className={`msg ${isYou ? 'you' : ''}`}>
                      <div className="av">
                        {char.avatarUrl && !isYou
                          ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <PixelAvatar kind={isYou ? 'player' : char.kind as any} size={24} />
                        }
                      </div>
                      <div>
                        <div className="who">
                          <span>{isYou ? (conv.userPersona?.name ?? '당신') : char.name}</span>
                          {!isYou && <span className={`ai-tag ${ai.className}`}>{ai.tag}</span>}
                        </div>
                        {isEditing ? (
                          <div className="vstack" style={{ gap: 4 }}>
                            <textarea
                              className="field" rows={3} value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } }}
                              style={{ minWidth: 200 }} autoFocus
                            />
                            <div className="hstack" style={{ gap: 4 }}>
                              <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={saveEdit}>저장 + 재생성</button>
                              <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setEditingId(null)}>취소</button>
                            </div>
                          </div>
                        ) : (
                          <div className="bubble"><NovelText text={m.content} /></div>
                        )}
                      </div>
                    </div>

                    {!isEditing && hoveredId === m.id && (
                      <div className={`msg-actions ${isYou ? 'you' : ''}`}>
                        {isLast && isLastAssistant && !isYou && (
                          <button className="msg-action-btn" onClick={handleRegenerate}>↺ 재생성</button>
                        )}
                        {isYou && (
                          <button className="msg-action-btn" onClick={() => startEdit(m.id, m.content)}>✏ 편집</button>
                        )}
                        <button className="msg-action-btn danger" onClick={() => handleDelete(m.id)}>✕ 삭제</button>
                      </div>
                    )}
                  </div>
                )
              })}

              {(typing || streaming) && (
                <div className="msg-wrap">
                  <div className="msg typing">
                    <div className="av">
                      {char.avatarUrl
                        ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <PixelAvatar kind={char.kind as any} size={24} />
                      }
                    </div>
                    <div>
                      <div className="who">
                        <span>{char.name}</span>
                        <span className={`ai-tag ${AI_MODELS.find(x => x.id === model)?.className ?? ''}`}>
                          {AI_MODELS.find(x => x.id === model)?.tag}
                        </span>
                      </div>
                      {streaming
                        ? <div className="bubble"><NovelText text={streaming} /></div>
                        : <div className="bubble dots" style={{ fontSize: 18, letterSpacing: 3, padding: '6px 10px' }}>
                            <span>•</span><span>•</span><span>•</span>
                          </div>
                      }
                    </div>
                  </div>
                  <button className="msg-action-btn" style={{ alignSelf: 'flex-start', marginTop: 2 }} onClick={stopStream}>■ 중단</button>
                </div>
              )}

              {messages.length === 0 && !typing && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)', fontSize: 11 }}>✦ 대화를 시작해보세요</div>
              )}
            </div>

            {sendError && (
              <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 8px' }}>⚠ {sendError}</div>
            )}
            <div className="composer">
              <input
                className="field"
                placeholder={`${char.name}에게 말 걸기…`}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
              />
              <button className="btn primary" onClick={() => send(text)} disabled={!text.trim() || typing}>전송</button>
            </div>
          </div>

          {showPanel && (
            <div className="side-panel">
              <div className="side-panel-header spread">
                <span style={{ fontWeight: 700, fontSize: 11 }}>대화 설정</span>
                <button className="btn ghost" style={{ padding: '1px 5px', fontSize: 11 }} onClick={() => setShowPanel(false)}>×</button>
              </div>

              <div className="side-section">
                <div className="label">대화 제목</div>
                {editingTitle ? (
                  <div className="hstack" style={{ gap: 4 }}>
                    <input
                      className="field" style={{ flex: 1, fontSize: 11 }}
                      value={titleInput}
                      onChange={e => setTitleInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false) }}
                      autoFocus
                    />
                    <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} onClick={handleTitleSave}>저장</button>
                    <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => setEditingTitle(false)}>취소</button>
                  </div>
                ) : (
                  <div className="spread" style={{ gap: 4 }}>
                    <div className="tiny" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                    <button className="msg-action-btn" style={{ fontSize: 9 }} onClick={() => { setTitleInput(conv.title); setEditingTitle(true) }}>✏</button>
                  </div>
                )}
              </div>

              <div className="side-section">
                <div className="label">페르소나</div>
                <div className="vstack" style={{ gap: 4 }}>
                  <div
                    className={`persona-option${!conv.userPersona ? ' selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handlePersonaChange(null)}
                  >
                    <PixelAvatar kind="player" size={22} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 10 }}>페르소나 없음</div>
                      <div className="tiny muted">기본 유저</div>
                    </div>
                    {!conv.userPersona && <span style={{ marginLeft: 'auto', color: 'var(--hot-pink)', fontSize: 10 }}>✓</span>}
                  </div>
                  {personas.map(p => (
                    <div
                      key={p.id}
                      className={`persona-option${conv.userPersona?.id === p.id ? ' selected' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handlePersonaChange(p.id)}
                    >
                      <PixelAvatar kind="player" size={22} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 10 }}>{p.name}</div>
                        <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                      </div>
                      {conv.userPersona?.id === p.id && <span style={{ marginLeft: 'auto', color: 'var(--hot-pink)', fontSize: 10 }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="side-section">
                <div className="label">핵심 메모리</div>
                <textarea
                  className="field" rows={3}
                  placeholder={"절대 잊으면 안 되는 설정을 적어두세요\n예: 유저는 마왕의 딸이다."}
                  value={conv.coreMemory}
                  onChange={e => handleCoreMemory(e.target.value)}
                />
              </div>

              <div className="side-section">
                <div className="label">타임라인 상태</div>
                <textarea
                  className="field" rows={2}
                  placeholder={"현재 에피소드 상태\n예: 마왕성 탐험 중 / 루나가 다리를 다침"}
                  value={conv.statusTimeline}
                  onChange={e => handleStatusTimeline(e.target.value)}
                />
              </div>

              <div className="side-section">
                <div className="spread" style={{ marginBottom: 4 }}>
                  <div className="label" style={{ marginBottom: 0 }}>로어북</div>
                  <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => { setLorebookAdd(a => !a); setLorebookEditId(null) }}>+ 추가</button>
                </div>
                <div className="tiny muted" style={{ marginBottom: 6 }}>키워드 감지 시 자동으로 세계관 정보를 AI에게 주입합니다.</div>

                {lorebookAdd && (
                  <div className="vstack" style={{ gap: 5, marginBottom: 8, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
                    <input
                      className="field" style={{ fontSize: 10 }} placeholder="키워드 (쉼표 구분)"
                      value={lbForm.keywords} onChange={e => setLbForm(f => ({ ...f, keywords: e.target.value }))}
                    />
                    <textarea
                      className="field" rows={2} style={{ fontSize: 10 }} placeholder="세계관 정보 내용"
                      value={lbForm.content} onChange={e => setLbForm(f => ({ ...f, content: e.target.value }))}
                    />
                    <div className="hstack" style={{ gap: 4 }}>
                      <label className="tiny muted">우선순위
                        <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
                          value={lbForm.priority} onChange={e => setLbForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
                      </label>
                      <label className="tiny muted">탐색깊이
                        <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
                          min={1} max={20} value={lbForm.scanDepth} onChange={e => setLbForm(f => ({ ...f, scanDepth: parseInt(e.target.value) || 5 }))} />
                      </label>
                      <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} onClick={handleAddLorebook}>저장</button>
                      <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => setLorebookAdd(false)}>취소</button>
                    </div>
                  </div>
                )}

                {lorebooks.length === 0 && !lorebookAdd && (
                  <div className="lorebook-placeholder"><span>로어북 항목이 없습니다</span></div>
                )}

                {lorebooks.map(lb => (
                  <div key={lb.id} style={{ marginBottom: 6, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
                    {lorebookEditId === lb.id ? (
                      <LorebookEditForm entry={lb} onSave={data => handlePatchLorebook(lb.id, data)} onCancel={() => setLorebookEditId(null)} />
                    ) : (
                      <>
                        <div className="spread" style={{ marginBottom: 2 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pink)' }}>{lb.keyword.join(', ')}</div>
                          <div className="hstack" style={{ gap: 3 }}>
                            <button className="msg-action-btn" style={{ fontSize: 9 }} onClick={() => { setLorebookEditId(lb.id); setLorebookAdd(false) }}>✏</button>
                            <button className="msg-action-btn danger" style={{ fontSize: 9 }} onClick={() => handleDeleteLorebook(lb.id)}>✕</button>
                          </div>
                        </div>
                        <div className="tiny muted" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 2 }}>{lb.content}</div>
                        <div className="tiny muted">우선순위 {lb.priority} · 탐색 {lb.scanDepth}턴</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Win>
  )
}

function LorebookEditForm({ entry, onSave, onCancel }: { entry: LbEntry; onSave: (data: Partial<LbEntry>) => void; onCancel: () => void }) {
  const [keywords, setKeywords] = useState(entry.keyword.join(', '))
  const [content, setContent] = useState(entry.content)
  const [priority, setPriority] = useState(entry.priority)
  const [scanDepth, setScanDepth] = useState(entry.scanDepth)
  return (
    <div className="vstack" style={{ gap: 5 }}>
      <input className="field" style={{ fontSize: 10 }} placeholder="키워드 (쉼표 구분)" value={keywords} onChange={e => setKeywords(e.target.value)} />
      <textarea className="field" rows={2} style={{ fontSize: 10 }} value={content} onChange={e => setContent(e.target.value)} />
      <div className="hstack" style={{ gap: 4 }}>
        <label className="tiny muted">우선순위
          <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
            value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)} />
        </label>
        <label className="tiny muted">탐색깊이
          <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
            min={1} max={20} value={scanDepth} onChange={e => setScanDepth(parseInt(e.target.value) || 5)} />
        </label>
        <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }}
          onClick={() => onSave({ keyword: keywords.split(',').map(k => k.trim()).filter(Boolean), content, priority, scanDepth })}>저장</button>
        <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
