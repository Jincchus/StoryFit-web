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
  currentAI: string
  updatedAt: string
  characters: { character: { name: string; kind: string; avatarUrl?: string } }[]
  messages: { content: string }[]
  userPersona?: { name: string } | null
}

export default function HomePage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<ConvItem[]>([])
  const [error, setError] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/conversations').then(setConversations).catch(e => setError(e.message))
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
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
            <button className="btn primary" onClick={() => router.push('/characters')}>✦ 새 대화 시작</button>
          </div>
        </div>

        {error && <div className="tiny" style={{ color: '#ff6b8a', padding: '4px 0' }}>⚠ {error}</div>}

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          {conversations.map(conv => {
            const char = conv.characters[0]?.character
            const ai = AI_MODELS.find(x => x.id === conv.currentAI) ?? AI_MODELS[0]
            const lastLine = conv.messages[0]?.content ?? ''
            const when = new Date(conv.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            return (
              <div
                key={conv.id}
                className="row"
                style={{ position: 'relative' }}
                onClick={() => router.push(`/conversations/${conv.id}`)}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
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
                <div className="vstack" style={{ alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span className="ai-pill" style={{ padding: '1px 5px', fontSize: 9, cursor: 'default' }}>
                    <span className="dot" style={{ background: ai.id === 'chatgpt' ? '#a3e0ff' : ai.id === 'gemini' ? '#c9b6ff' : '#b8f5d2' }} />
                    {ai.short}
                  </span>
                  <span className="when">{when}</span>
                  {hoveredId === conv.id && (
                    <button
                      className="msg-action-btn danger"
                      style={{ fontSize: 9, padding: '1px 5px' }}
                      onClick={e => handleDelete(e, conv.id)}
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
