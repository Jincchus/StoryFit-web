'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ConvItem {
  id: string
  title: string
  mode: string
  updatedAt: string
  characters: { character: { name: string; avatarUrl?: string } }[]
  messages: { content: string }[]
  personaCharacter?: { name: string } | null
}

const MODE_LABEL: Record<string, string> = {
  multiStory: '👥 멀티스토리',
  story: '📖 스토리',
}

function previewText(content: string): string {
  return content.replace(/\*[^*\n]+\*/g, '').replace(/\n+/g, ' ').trim()
}

export default function LibraryPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<ConvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [unarchiveId, setUnarchiveId] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/library')
      .then(setConversations)
      .finally(() => setLoading(false))
  }, [])

  const handleUnarchive = async (id: string) => {
    await api.patch(`/api/conversations/${id}`, { isArchived: false })
    setConversations(prev => prev.filter(c => c.id !== id))
    setUnarchiveId(null)
  }

  return (
    <>
      {unarchiveId && (
        <ConfirmDialog
          message="이 대화를 채팅 목록으로 되돌릴까요?"
          confirmLabel="꺼내기"
          confirmVariant="primary"
          onConfirm={() => handleUnarchive(unarchiveId)}
          onCancel={() => setUnarchiveId(null)}
        />
      )}
      <Win title="서재 (Library)" icon={PixelIcons.chat}>
        <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
          <div className="spread">
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>서재</div>
              <div className="tiny muted">완결된 이야기 {conversations.length}편</div>
            </div>
          </div>

          <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div className="tiny muted">불러오는 중...</div>
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
                <div style={{ fontSize: 32 }}>📚</div>
                <div style={{ marginTop: 8 }}>아직 서재에 보관된 이야기가 없어요</div>
                <div className="tiny" style={{ marginTop: 4 }}>채팅 목록에서 📚 버튼을 누르면 서재로 보낼 수 있어요</div>
              </div>
            ) : conversations.map(conv => {
              const char = conv.characters[0]?.character
              const lastLine = conv.messages[0]?.content ?? ''
              const when = new Date(conv.updatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

              return (
                <div
                  key={conv.id}
                  className="row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/library/${conv.id}`)}
                >
                  <div className="thumb">
                    {char?.avatarUrl
                      ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <PixelAvatar kind="custom" size={36} />
                    }
                  </div>
                  <div className="meta">
                    <h4>{conv.title}</h4>
                    <p className="muted" style={{ fontSize: 10, marginBottom: 2 }}>
                      {char?.name}
                      {conv.personaCharacter && <span> · {conv.personaCharacter.name}로 플레이</span>}
                    </p>
                    <p>{previewText(lastLine)}</p>
                  </div>
                  <div className="vstack" style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span className="mode-badge" style={{ fontSize: 8 }}>{MODE_LABEL[conv.mode] ?? conv.mode}</span>
                    <span className="when">{when}</span>
                    <button
                      className="btn ghost"
                      style={{ fontSize: 10, padding: '3px 8px' }}
                      onClick={e => { e.stopPropagation(); setUnarchiveId(conv.id) }}
                      title="채팅 목록으로 되돌리기"
                    >↩ 꺼내기</button>
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
