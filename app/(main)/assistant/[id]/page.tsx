'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import {
  getStream,
  createStream,
  updateStream,
  clearStream,
  subscribe,
} from '@/lib/assistantStream'

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

async function runStream(convId: string, content: string, userMsgId: string) {
  const abort = new AbortController()
  const entry = createStream(convId, userMsgId, abort)

  try {
    const res = await fetch(`/api/conversations/${convId}/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content }),
      signal: abort.signal,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      updateStream(convId, { error: data.error ?? '전송 실패', done: true })
      return
    }

    for await (const chunk of readSseStream(res)) {
      if (abort.signal.aborted) break
      if (chunk.error) { updateStream(convId, { error: chunk.error, done: true }); return }
      if (chunk.text) updateStream(convId, { text: entry.text + chunk.text })
      if (chunk.done) updateStream(convId, { msgId: chunk.messageId, done: true })
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      updateStream(convId, { error: e.message ?? '오류가 발생했습니다.', done: true })
    }
  }
}

export default function AssistantChatPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState('')
  const [title, setTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
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
    const existing = getStream(id)
    if (!existing) return

    setIsStreaming(true)
    setStreamingText(existing.text)
    setStreamError(existing.error)

    const unsub = subscribe(id, () => {
      const s = getStream(id)
      if (!s) return
      setStreamingText(s.text)
      setStreamError(s.error)
      if (s.done) {
        setIsStreaming(false)
        if (s.text) {
          setMessages(prev => [...prev, { id: s.msgId ?? `ai-${Date.now()}`, role: 'assistant', content: s.text }])
          setStreamingText('')
        }
        clearStream(id)
      }
    })
    return unsub
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, isStreaming])

  const saveTitle = async () => {
    const t = draftTitle.trim()
    if (!t || t === title) { setEditingTitle(false); return }
    setTitle(t)
    setEditingTitle(false)
    await api.patch(`/api/conversations/${id}`, { title: t })
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    setStreamError('')
    setIsStreaming(true)
    setStreamingText('')

    const tempId = `tmp-${Date.now()}`
    const userMsg: Msg = { id: tempId, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    runStream(id, text, tempId)

    const unsub = subscribe(id, () => {
      const s = getStream(id)
      if (!s) return
      setStreamingText(s.text)
      setStreamError(s.error)
      if (s.done) {
        setIsStreaming(false)
        if (s.text) {
          setMessages(prev => [...prev, { id: s.msgId ?? `ai-${Date.now()}`, role: 'assistant', content: s.text }])
          setStreamingText('')
        }
        clearStream(id)
        unsub()
        textareaRef.current?.focus()
      }
    })
  }, [id, input, isStreaming])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const adjustHeight = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  const stopStream = () => {
    const s = getStream(id)
    if (s) s.abort.abort()
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
          {messages.length === 0 && !isStreaming && (
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

          {isStreaming && !streamingText && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--lavender)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <BotIcon />
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: '12px 12px 12px 4px' }}>
                <div className="dots" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-soft)' }} />
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-soft)' }} />
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-soft)' }} />
                </div>
              </div>
            </div>
          )}

          {streamingText && (
            <AssistantMessage msg={{ id: 'streaming', role: 'assistant', content: streamingText }} streaming />
          )}

          {streamError && (
            <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 8px', background: 'var(--pane)', borderRadius: 'var(--radius)' }}>
              ⚠ {streamError}
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
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="btn danger" style={{ fontSize: 10, flexShrink: 0 }} onClick={stopStream}>■ 중지</button>
          ) : (
            <button className="btn primary" style={{ fontSize: 11, flexShrink: 0 }} disabled={!input.trim()} onClick={send}>전송</button>
          )}
        </div>

      </div>
    </Win>
  )
}

function BotIcon() {
  return (
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
  )
}

function AssistantMessage({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: 6, alignItems: 'flex-start' }}>
      {!isUser && (
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--lavender)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <BotIcon />
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
