'use client'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { AI_MODELS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar from '@/components/ui/PixelAvatar'
import { PixelIcons } from '@/components/ui/PixelAvatar'

export default function HomePage() {
  const router = useRouter()
  const { state } = useApp()
  const { conversations, characters, personas } = state

  return (
    <Win title="홈 (Home)" icon={PixelIcons.home}>
      <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>최근 대화</div>
            <div className="tiny muted">{conversations.length}개의 진행 중인 롤플레이</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            <button className="btn" onClick={() => router.push('/personas')}>내 페르소나</button>
            <button className="btn primary" onClick={() => router.push('/characters')}>✦ 새 대화 시작</button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          {conversations.map(conv => {
            const char = conv.characters[0]
            const persona = personas.find(p => p.id === conv.userPersonaId)
            const ai = AI_MODELS.find(x => x.id === conv.currentAI) ?? AI_MODELS[0]
            return (
              <div className="row" key={conv.id} onClick={() => router.push(`/conversations/${conv.id}`)}>
                <div className="thumb">
                  {char?.avatarUrl
                    ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <PixelAvatar kind={char?.kind} size={36} />
                  }
                </div>
                <div className="meta">
                  <h4>
                    {char?.name}
                    {persona && <span className="muted" style={{ fontWeight: 400 }}> · {persona.name}로 플레이</span>}
                  </h4>
                  <p>{conv.lastLine}</p>
                </div>
                <div className="vstack" style={{ alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span className="ai-pill" style={{ padding: '1px 5px', fontSize: 9, cursor: 'default' }}>
                    <span className="dot" style={{ background: ai.id === 'chatgpt' ? '#a3e0ff' : ai.id === 'gemini' ? '#c9b6ff' : '#b8f5d2' }} />
                    {ai.short}
                  </span>
                  <span className="when">{conv.when}</span>
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
