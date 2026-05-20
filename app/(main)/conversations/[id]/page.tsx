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
  userPersona?: { name: string } | null
  messages: Msg[]
}

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
            if (json.error) setStreaming('')
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
                        : <div className="bubble dots"><span>•</span><span>•</span><span>•</span></div>
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
                disabled={typing}
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
                <div className="label">페르소나</div>
                <div className="tiny muted">{conv.userPersona ? `${conv.userPersona.name} — ` : '페르소나 없음 (기본 유저)'}</div>
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
                  <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }}>+ 추가</button>
                </div>
                <div className="tiny muted">키워드 감지 시 자동으로 세계관 정보를 AI에게 주입합니다.</div>
                <div className="lorebook-placeholder"><span>로어북 항목이 없습니다</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Win>
  )
}
