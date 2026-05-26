'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import PixelAvatar from '@/components/ui/PixelAvatar'

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

export default function LibraryReadPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [conv, setConv] = useState<Conv | null>(null)
  const [branchMsgId, setBranchMsgId] = useState<string | null>(null)
  const [branchDesc, setBranchDesc] = useState('')
  const [branching, setBranching] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get(`/api/conversations/${id}`).then(setConv)
  }, [id])

  const charMap = Object.fromEntries(
    (conv?.characters ?? []).map(cc => [cc.character.id, cc.character])
  )

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

      <div className="scroll" style={{ flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {conv.messages.map((msg, idx) => {
          const isUser = msg.role === 'user'
          const char = msg.characterId ? charMap[msg.characterId] : conv.characters[0]?.character
          const persona = conv.personaCharacter
          const speaker = isUser ? persona : char
          const isLast = idx === conv.messages.length - 1

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
                </div>
              </div>

              {!isUser && !isLast && (
                <div style={{ marginTop: 6, marginLeft: 42 }}>
                  <button
                    className="btn ghost"
                    style={{ fontSize: 9, padding: '2px 7px', opacity: 0.6 }}
                    onClick={() => { setBranchMsgId(msg.id); setBranchDesc('') }}
                  >⑂ 여기서 분기</button>
                </div>
              )}
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
