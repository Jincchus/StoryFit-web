'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { AI_MODELS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'

interface ConvItem {
  id: string
  title: string
  mode: string
  currentAI: string
  updatedAt: string
  characters: { character: { name: string; kind: string; avatarUrl?: string } }[]
  messages: { content: string }[]
  userPersona?: { name: string } | null
}

const MODE_LABEL: Record<string, string> = {
  roleplay: '⚔ 롤플레이',
  novel: '✍ 소설',
  tikiTaka: '⟳ 티키타카',
}

export default function HomePage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<ConvItem[]>([])
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get('/api/conversations').then(setConversations).catch(e => setError(e.message))
  }, [])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === conversations.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(conversations.map(c => c.id)))
    }
  }

  const exitSelect = () => { setSelecting(false); setSelected(new Set()) }

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleting) return
    setDeleting(true)
    try {
      await Promise.all(Array.from(selected).map(id => api.delete(`/api/conversations/${id}`)))
      setConversations(prev => prev.filter(c => !selected.has(c.id)))
      exitSelect()
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteOne = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.delete(`/api/conversations/${id}`)
    setConversations(prev => prev.filter(c => c.id !== id))
  }

  return (
    <Win title="홈 (Home)" icon={PixelIcons.home}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>최근 대화</div>
            <div className="tiny muted">{conversations.length}개의 진행 중인 롤플레이</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            {selecting ? (
              <>
                <button className="btn ghost" style={{ fontSize: 10 }} onClick={toggleAll}>
                  {selected.size === conversations.length ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  className="btn danger"
                  style={{ fontSize: 10 }}
                  disabled={selected.size === 0 || deleting}
                  onClick={handleDeleteSelected}
                >
                  {deleting ? '삭제 중...' : `✕ 삭제 (${selected.size})`}
                </button>
                <button className="btn ghost" style={{ fontSize: 10 }} onClick={exitSelect}>취소</button>
              </>
            ) : (
              <>
                {conversations.length > 0 && (
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setSelecting(true)}>☑ 선택</button>
                )}
                <button className="btn primary" onClick={() => router.push('/characters')}>✦ 새 대화 시작</button>
              </>
            )}
          </div>
        </div>

        {error && <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 0' }}>⚠ {error}</div>}

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          {conversations.map(conv => {
            const char = conv.characters[0]?.character
            const ai = AI_MODELS.find(x => x.id === conv.currentAI) ?? AI_MODELS[0]
            const lastLine = conv.messages[0]?.content ?? ''
            const when = new Date(conv.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            const isChecked = selected.has(conv.id)

            return (
              <div
                key={conv.id}
                className="row"
                style={{ position: 'relative', cursor: selecting ? 'pointer' : undefined, background: isChecked ? 'var(--lavender)' : undefined }}
                onClick={() => selecting ? toggleSelect(conv.id) : router.push(`/conversations/${conv.id}`)}
              >
                {selecting && (
                  <div style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 20 }}>
                    <div style={{
                      width: 14, height: 14,
                      border: `1.5px solid ${isChecked ? 'var(--hot-pink)' : 'var(--chrome-border)'}`,
                      background: isChecked ? 'var(--hot-pink)' : 'transparent',
                      borderRadius: 2,
                      display: 'grid', placeItems: 'center',
                    }}>
                      {isChecked && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
                    </div>
                  </div>
                )}
                <div className="thumb">
                  {char?.avatarUrl
                    ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <PixelAvatar kind={char?.kind as any} size={36} />
                  }
                </div>
                <div className="meta">
                  <h4>
                    {conv.title}
                    {conv.userPersona && <span className="muted" style={{ fontWeight: 400 }}> · {conv.userPersona.name}로 플레이</span>}
                  </h4>
                  <p className="muted" style={{ fontSize: 10, marginBottom: 2 }}>{char?.name}</p>
                  <p>{lastLine}</p>
                </div>
                <div className="vstack" style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <div className="hstack" style={{ gap: 4 }}>
                    <span className="mode-badge" style={{ fontSize: 8 }}>{MODE_LABEL[conv.mode] ?? conv.mode}</span>
                    <span className="ai-pill" style={{ padding: '1px 5px', fontSize: 9, cursor: 'default' }}>
                      <span className="dot" style={{ background: ai.id === 'chatgpt' ? '#a3e0ff' : ai.id === 'gemini' ? '#c9b6ff' : '#b8f5d2' }} />
                      {ai.short}
                    </span>
                  </div>
                  <span className="when">{when}</span>
                  {!selecting && (
                    <button
                      className="btn danger"
                      style={{ fontSize: 10, padding: '3px 8px', minWidth: 44 }}
                      onClick={e => handleDeleteOne(e, conv.id)}
                    >✕ 삭제</button>
                  )}
                </div>
              </div>
            )
          })}

          {conversations.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
              <div style={{ fontSize: 32 }}>♡</div>
              <div style={{ marginTop: 8 }}>아직 시작한 롤플레이가 없어요</div>
              <div className="tiny" style={{ marginTop: 4 }}>위의 <b>새 대화 시작</b> 버튼을 눌러보세요</div>
            </div>
          )}
        </div>
      </div>
    </Win>
  )
}
