'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface AssistantConv {
  id: string
  title: string
  updatedAt: string
  messages: { content: string }[]
}

function previewText(content: string): string {
  return content.replace(/\n+/g, ' ').trim()
}

export default function AssistantPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<AssistantConv[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.get('/api/conversations?mode=assistant')
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleNew = async () => {
    if (creating) return
    setCreating(true)
    try {
      const now = new Date()
      const label = now.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      const conv = await api.post('/api/conversations', {
        title: `AI 채팅 ${label}`,
        mode: 'assistant',
        currentAI: 'gemini',
      })
      router.push(`/assistant/${conv.id}`)
    } catch {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/api/conversations/${id}`)
    setConversations(prev => prev.filter(c => c.id !== id))
    setConfirmDeleteId(null)
  }

  return (
    <>
      {confirmDeleteId && (
        <ConfirmDialog
          message="이 대화를 삭제할까요? 복구할 수 없습니다."
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
      <Win title="AI 채팅" icon={PixelIcons.bot}>
        <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
          <div className="spread">
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>AI 채팅</div>
              <div className="tiny muted">롤플레이 없이 AI와 자유롭게 대화</div>
            </div>
            <button className="btn primary" onClick={handleNew} disabled={creating}>
              {creating ? '생성 중...' : '✦ 새 대화'}
            </button>
          </div>

          <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div className="tiny muted">불러오는 중...</div>
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
                <div style={{ fontSize: 32 }}>🤖</div>
                <div style={{ marginTop: 8 }}>아직 대화가 없어요</div>
                <div className="tiny" style={{ marginTop: 4 }}>위의 <b>새 대화</b> 버튼을 눌러보세요</div>
              </div>
            ) : conversations.map(conv => {
              const lastLine = conv.messages[0]?.content ?? ''
              const when = new Date(conv.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

              return (
                <div
                  key={conv.id}
                  className="row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/assistant/${conv.id}`)}
                >
                  <div className="thumb" style={{ background: 'var(--lavender)', display: 'grid', placeItems: 'center' }}>
                    {PixelIcons.bot}
                  </div>
                  <div className="meta">
                    <h4>{conv.title}</h4>
                    <p>{previewText(lastLine)}</p>
                  </div>
                  <div className="vstack" style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span className="when">{when}</span>
                    <button
                      className="btn danger"
                      style={{ fontSize: 10, padding: '3px 8px' }}
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(conv.id) }}
                    >✕ 삭제</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Win>
    </>
  )
}
