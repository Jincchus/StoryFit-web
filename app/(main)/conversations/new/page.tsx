'use client'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { AI_MODELS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import type { AIProvider, Conversation } from '@/types'

export default function NewConversationPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const { draft, characters, personas } = state
  const char = characters.find(c => c.id === draft.charId)

  const handleStart = () => {
    if (!char) return
    const greetings = [char.firstMessage, ...char.alternateGreetings].filter(Boolean)
    const firstMsg = greetings[Math.floor(Math.random() * greetings.length)] ?? ''
    const id = 'c' + Date.now()
    const conv: Conversation = {
      id, title: `${char.name}와의 대화`,
      currentAI: draft.modelId,
      userPersonaId: draft.personaId,
      coreMemory: '', statusTimeline: '',
      isSummarizing: false,
      characters: [char],
      lastLine: firstMsg || '[새 대화 시작]',
      when: '방금 전',
      messages: firstMsg
        ? [{ id: 'm' + Date.now(), role: 'assistant', content: firstMsg, aiModel: draft.modelId, isSelected: true, parentId: null }]
        : [],
    }
    dispatch({ type: 'startNewConv', conv })
    router.push(`/conversations/${id}`)
  }

  return (
    <Win title="새 대화 설정 (New Conversation)" icon={PixelIcons.chat}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>대화를 시작하기 전에</div>
            <div className="tiny muted">페르소나와 AI 모델을 선택하세요</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            <button className="btn ghost" onClick={() => router.push('/characters')}>← 뒤로</button>
            <button className="btn primary" disabled={!char} onClick={handleStart}>✦ 롤플레이 시작</button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div className="new-conv-grid">
            <section className="new-conv-section">
              <div className="label">선택한 캐릭터</div>
              <div className="row" style={{ cursor: 'default' }}>
                <div className="thumb">
                  {char?.avatarUrl
                    ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <PixelAvatar kind={char?.kind} size={36} />
                  }
                </div>
                <div className="meta">
                  <h4>{char?.name} <span className="muted" style={{ fontWeight: 400 }}>· {char?.title}</span></h4>
                  <p style={{ fontStyle: 'italic' }}>&quot;{char?.firstMessage}&quot;</p>
                </div>
              </div>
            </section>

            <section className="new-conv-section">
              <div className="label">내 페르소나 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
              <div className="vstack" style={{ gap: 6 }}>
                <div
                  className={`persona-option ${!draft.personaId ? 'selected' : ''}`}
                  onClick={() => dispatch({ type: 'selectPersona', id: null })}
                >
                  <div className="thumb" style={{ width: 32, height: 32 }}><PixelAvatar kind="player" size={32} /></div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 11 }}>페르소나 없음</div>
                    <div className="tiny muted">기본 유저로 대화</div>
                  </div>
                </div>
                {personas.map(p => (
                  <div
                    key={p.id}
                    className={`persona-option ${draft.personaId === p.id ? 'selected' : ''}`}
                    onClick={() => dispatch({ type: 'selectPersona', id: p.id })}
                  >
                    <div className="thumb" style={{ width: 32, height: 32, background: 'var(--lavender)', display: 'grid', placeItems: 'center' }}>
                      <PixelAvatar kind="player" size={28} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 11 }}>{p.name}</div>
                      <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                    </div>
                  </div>
                ))}
                <button className="btn ghost" style={{ fontSize: 10, padding: '4px 8px', alignSelf: 'flex-start' }} onClick={() => router.push('/personas')}>
                  + 페르소나 관리
                </button>
              </div>
            </section>

            <section className="new-conv-section">
              <div className="label">AI 모델</div>
              <div className="vstack" style={{ gap: 6 }}>
                {AI_MODELS.map(m => (
                  <div
                    key={m.id}
                    className={`ai-model-option ${draft.modelId === m.id ? 'selected' : ''} ${m.disabled ? 'disabled' : ''}`}
                    onClick={() => { if (!m.disabled) dispatch({ type: 'selectModel', id: m.id as AIProvider }) }}
                  >
                    <span className="dot" style={{ width: 8, height: 8, borderRadius: 0, flexShrink: 0, background: m.id === 'chatgpt' ? '#a3e0ff' : m.id === 'gemini' ? '#c9b6ff' : '#b8f5d2', border: '1px solid var(--chrome-border)' }} />
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 11 }}>{m.name}</span>
                    {m.disabled && <span className="tiny muted">v2에서 추가</span>}
                    {draft.modelId === m.id && !m.disabled && <span style={{ color: 'var(--hot-pink)' }}>✓</span>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Win>
  )
}
