'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'

interface Msg {
  id: string
  role: string
  content: string
}

async function* readSseStream(res: Response) {
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
      try { yield JSON.parse(line.slice(6)) } catch {}
    }
  }
}

export default function AssistantChatPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.get(`/api/conversations/${id}`)
      .then((conv: any) => {
        setTitle(conv.title)
        setDraftTitle(conv.title)
        setMessages(conv.messages ?? [])
      })
      .catch(() => router.replace('/assistant'))
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const saveTitle = async () => {
    const t = draftTitle.trim()
    if (!t || t === title) { setEditingTitle(false); return }
    setTitle(t)
    setEditingTitle(false)
    await api.patch(`/api/conversations/${id}`, { title: t })
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setError('')
    setStreaming(true)
    setStreamingText('')

    const tempId = `tmp-${Date.now()}`
    const userMsg: Msg = { id: tempId, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch(`/api/conversations/${id}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: text }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '전송 실패')
      }

      let fullText = ''
      let assistantMsgId: string | null = null

      for await (const chunk of readSseStream(res)) {
        if (abort.signal.aborted) break
        if (chunk.error) { setError(chunk.error); break }
        if (chunk.text) {
          fullText += chunk.text
          setStreamingText(fullText)
        }
        if (chunk.done) {
          assistantMsgId = chunk.messageId
        }
      }

      if (fullText) {
        setMessages(prev => [...prev, {
          id: assistantMsgId ?? `ai-${Date.now()}`,
          role: 'assistant',
          content: fullText,
        }])
      }
      setStreamingText('')
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message ?? '오류가 발생했습니다.')
    } finally {
      setStreaming(false)
      abortRef.current = null
      textareaRef.current?.focus()
    }
  }, [id, input, streaming])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const adjustHeight = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  return (
    <Win
      title={title || 'AI 채팅'}
      icon={PixelIcons.bot}
      titlebarExtra={
        <button className="btn ghost" style={{ fontSize: 10, marginLeft: 4 }} onClick={() => router.push('/assistant')}>← 목록</button>
      }
    >
      <div className="vstack" style={{ flex: 1, minHeight: 0, gap: 0 }}>

        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--chrome-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {editingTitle ? (
            <>
              <input
                className="field"
                style={{ flex: 1, fontSize: 11 }}
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                autoFocus
              />
              <button className="btn primary" style={{ fontSize: 10 }} onClick={saveTitle}>저장</button>
              <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setEditingTitle(false)}>취소</button>
            </>
          ) : (
            <button
              className="btn ghost"
              style={{ fontSize: 10, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => setEditingTitle(true)}
            >✎ {title}</button>
          )}
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && !streamingText && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5 }}>
              <div style={{ fontSize: 28 }}>🤖</div>
              <div className="tiny muted" style={{ textAlign: 'center', lineHeight: 1.6 }}>
                무엇이든 물어보세요.<br />아래에 메시지를 입력하면 됩니다.
              </div>
            </div>
          )}

          {messages.map(msg => (
            <AssistantMessage key={msg.id} msg={msg} />
          ))}

          {streamingText && (
            <AssistantMessage msg={{ id: 'streaming', role: 'assistant', content: streamingText }} streaming />
          )}

          {error && (
            <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 8px', background: 'var(--pane)', borderRadius: 'var(--radius)' }}>
              ⚠ {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div style={{ borderTop: '1px solid var(--chrome-border)', padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            className="field"
            rows={1}
            style={{ flex: 1, resize: 'none', fontSize: 12, lineHeight: 1.5, overflow: 'hidden', minHeight: 32 }}
            placeholder="메시지 입력... (Shift+Enter: 줄바꿈)"
            value={input}
            onChange={e => { setInput(e.target.value); adjustHeight(e.target) }}
            onKeyDown={handleKeyDown}
            disabled={streaming}
          />
          {streaming ? (
            <button
              className="btn danger"
              style={{ fontSize: 10, flexShrink: 0 }}
              onClick={() => abortRef.current?.abort()}
            >■ 중지</button>
          ) : (
            <button
              className="btn primary"
              style={{ fontSize: 11, flexShrink: 0 }}
              disabled={!input.trim()}
              onClick={send}
            >전송</button>
          )}
        </div>

      </div>
    </Win>
  )
}

function AssistantMessage({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 6,
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--lavender)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="16" height="16">
            <rect x="7" y="1" width="2" height="2" fill="#c9b6ff"/>
            <rect x="3" y="3" width="10" height="8" fill="#8b5cf6"/>
            <rect x="4" y="4" width="8" height="6" fill="#c9b6ff"/>
            <rect x="5" y="5" width="2" height="2" fill="#1a1438"/>
            <rect x="9" y="5" width="2" height="2" fill="#1a1438"/>
            <rect x="6" y="5" width="1" height="1" fill="#a3e0ff"/>
            <rect x="10" y="5" width="1" height="1" fill="#a3e0ff"/>
            <rect x="6" y="8" width="4" height="1" fill="#ff8fcf"/>
            <rect x="1" y="6" width="2" height="3" fill="#8b5cf6"/>
            <rect x="13" y="6" width="2" height="3" fill="#8b5cf6"/>
            <rect x="4" y="11" width="3" height="3" fill="#8b5cf6"/>
            <rect x="9" y="11" width="3" height="3" fill="#8b5cf6"/>
            <rect x="7" y="12" width="2" height="1" fill="#8b5cf6"/>
          </svg>
        </div>
      )}
      <div style={{
        maxWidth: '75%',
        padding: '7px 11px',
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        background: isUser ? 'var(--hot-pink)' : 'var(--pane)',
        color: isUser ? '#fff' : 'var(--ink)',
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        border: isUser ? 'none' : '1px solid var(--chrome-border)',
      }}>
        {msg.content}
        {streaming && <span style={{ opacity: 0.5 }}>▋</span>}
      </div>
    </div>
  )
}
