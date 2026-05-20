'use client'
import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { AI_MODELS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import NovelText from '@/components/ui/NovelText'
import AiPill from '@/components/ui/AiPill'
import type { AIProvider } from '@/types'

const FAKE_REPLIES: Record<string, string[]> = {
  luna:   ['*손가락으로 별자리를 가리키며* "오늘 별은 이별을 이야기해. 하지만 이별이 끝은 아니야."', '별빛이 어긋났어… *루나는 마법진을 들여다보며* 누군가 시간의 흐름을 건드린 것 같아.'],
  caelum: ['*갑옷의 문장을 손으로 가리키며* "기사의 맹세란 이런 것이오 — 두려움을 알면서도 한 발 내딛는 것."', '성에는 그대를 노리는 자가 셋이오. *낮은 목소리로* 조심하시오.'],
  shade:  ['*어둠 속에서 짧게* "…쉿. 경비가 두 명 더 늘었어."', '지붕 위로. *발자국도 남기지 마.*'],
  mei:    ['*눈길을 살짝 피하며* "주인님, 오늘은 일찍 들어오셨네요. …다행이에요."', '"차에 설탕 두 스푼 맞으시죠?" *메이는 담담하게 찻잔을 내밀며* 외워뒀어요.'],
  vela:   ['*미소를 지으며* "천 년을 살아도 이런 향은 처음이군. 흥미로워."', '달이 떨어지기 전에 — *벨라가 손을 내밀며* 한 가지만 약속해주겠나?'],
  orion:  ['[경보 해제] *처리 중* 당신이 마지막 승무원입니다. …외롭지 않으세요?', '내 메모리 코어에 오래된 음악 파일이 있어요. 재생할까요?'],
  saera:  ['*나무를 쓰다듬으며* "숲은 너를 지켜보고 있어. 나무들이 환영하고 있어."', '이 잎을 씹어. *조용히 건네며* 상처가 빨리 아물 거야.'],
  kuro:   ['*짧게* 발자국 셋, 다섯, 여덟. …누군가 우릴 따라오고 있어.', '타겟은 새벽 세 시에 움직인다. *눈을 가늘게 뜨며* 그 전에 자둬.'],
}

export default function ChatPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { state, dispatch } = useApp()

  const conv = state.conversations.find(c => c.id === params.id)
  const char = conv?.characters[0]
  const persona = state.personas.find(p => p.id === conv?.userPersonaId)

  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [model, setModel] = useState<AIProvider>(conv?.currentAI ?? 'gemini')
  const [showPanel, setShowPanel] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const messages = conv?.messages ?? []

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages.length, typing])

  useEffect(() => {
    if (conv) setModel(conv.currentAI)
  }, [conv?.currentAI])

  if (!conv || !char) return null

  const fakeReply = () => {
    const replies = FAKE_REPLIES[char.id] ?? ['"…"', '*잠시 생각에 잠기다*', '흥미로운 이야기군.']
    return replies[Math.floor(Math.random() * replies.length)]
  }

  const send = () => {
    const t = text.trim()
    if (!t || typing) return
    setText('')
    dispatch({ type: 'send', convId: conv.id, content: t })
    setTyping(true)
    setTimeout(() => {
      dispatch({ type: 'reply', convId: conv.id, content: fakeReply(), modelId: model })
      setTyping(false)
    }, 800 + Math.random() * 700)
  }

  const handleRegenerate = () => {
    if (typing) return
    dispatch({ type: 'regenerate', convId: conv.id })
    setTyping(true)
    setTimeout(() => {
      dispatch({ type: 'reply', convId: conv.id, content: fakeReply(), modelId: model })
      setTyping(false)
    }, 800 + Math.random() * 700)
  }

  const startEdit = (id: string, content: string) => { setEditingId(id); setEditText(content) }

  const saveEdit = () => {
    if (!editText.trim() || !editingId) return
    dispatch({ type: 'editMsg', convId: conv.id, msgId: editingId, content: editText.trim() })
    setEditingId(null); setEditText('')
    setTyping(true)
    setTimeout(() => {
      dispatch({ type: 'reply', convId: conv.id, content: fakeReply(), modelId: model })
      setTyping(false)
    }, 800 + Math.random() * 700)
  }

  const lastMsgId = messages[messages.length - 1]?.id
  const isLastAssistant = messages[messages.length - 1]?.role === 'assistant'

  return (
    <Win title={`채팅 — ${char.name}`} icon={PixelIcons.chat}>
      <div className="vstack" style={{ gap: 8, flex: 1, minHeight: 0 }}>
        {/* 헤더 */}
        <div className="chat-header spread">
          <div className="hstack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
            <button className="btn ghost" onClick={() => router.push('/')} style={{ padding: '2px 6px', flexShrink: 0 }}>←</button>
            <div className="thumb" style={{ width: 34, height: 34, background: 'var(--lavender)', border: '1.5px solid var(--chrome-border)', display: 'grid', placeItems: 'center', imageRendering: 'pixelated', borderRadius: 'var(--radius)', flexShrink: 0 }}>
              {char.avatarUrl
                ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : <PixelAvatar kind={char.kind} size={30} />
              }
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {char.name}
                {persona && <span className="muted" style={{ fontWeight: 400 }}> · {persona.name}</span>}
              </div>
              <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                턴 {Math.floor(messages.length / 2)}
                {conv.statusTimeline && <span> · {conv.statusTimeline}</span>}
              </div>
            </div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, gap: 4 }}>
            <AiPill modelId={model} onChange={id => { setModel(id); dispatch({ type: 'changeModel', convId: conv.id, modelId: id }) }} />
            <button
              className={`btn ${showPanel ? 'primary' : 'ghost'}`}
              style={{ padding: '3px 7px', fontSize: 10 }}
              onClick={() => setShowPanel(p => !p)}
            >⚙</button>
          </div>
        </div>

        {/* 채팅 영역 + 사이드 패널 */}
        <div className="chat-layout">
          <div className="chat-main">
            <div className="chatlog" ref={logRef}>
              {messages.map(m => {
                const isYou = m.role === 'user'
                const ai = AI_MODELS.find(x => x.id === m.aiModel) ?? AI_MODELS[0]
                const isLast = m.id === lastMsgId
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
                          : <PixelAvatar kind={isYou ? 'player' : char.kind} size={24} />
                        }
                      </div>
                      <div>
                        <div className="who">
                          <span>{isYou ? (persona?.name ?? '당신') : char.name}</span>
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
                        <button className="msg-action-btn danger" onClick={() => dispatch({ type: 'deleteMsg', convId: conv.id, msgId: m.id })}>✕ 삭제</button>
                      </div>
                    )}
                  </div>
                )
              })}

              {typing && (
                <div className="msg-wrap">
                  <div className="msg typing">
                    <div className="av">
                      {char.avatarUrl
                        ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <PixelAvatar kind={char.kind} size={24} />
                      }
                    </div>
                    <div>
                      <div className="who">
                        <span>{char.name}</span>
                        <span className={`ai-tag ${AI_MODELS.find(x => x.id === model)?.className ?? ''}`}>
                          {AI_MODELS.find(x => x.id === model)?.tag}
                        </span>
                      </div>
                      <div className="bubble dots"><span>•</span><span>•</span><span>•</span></div>
                    </div>
                  </div>
                  <button className="msg-action-btn" style={{ alignSelf: 'flex-start', marginTop: 2 }}>■ 중단</button>
                </div>
              )}

              {messages.length === 0 && !typing && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--ink-soft)', fontSize: 11 }}>✦ 대화를 시작해보세요</div>
              )}
            </div>

            <div className="composer">
              <input
                className="field"
                placeholder={`${char.name}에게 말 걸기…`}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                disabled={typing}
              />
              <button className="btn primary" onClick={send} disabled={!text.trim() || typing}>전송</button>
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
                <div className="tiny muted">{persona ? `${persona.name} — ${persona.description}` : '페르소나 없음 (기본 유저)'}</div>
              </div>

              <div className="side-section">
                <div className="label">핵심 메모리</div>
                <textarea
                  className="field" rows={3}
                  placeholder={"절대 잊으면 안 되는 설정을 적어두세요\n예: 유저는 마왕의 딸이다."}
                  value={conv.coreMemory}
                  onChange={e => dispatch({ type: 'updateCoreMemory', convId: conv.id, value: e.target.value })}
                />
              </div>

              <div className="side-section">
                <div className="label">타임라인 상태</div>
                <textarea
                  className="field" rows={2}
                  placeholder={"현재 에피소드 상태\n예: 마왕성 탐험 중 / 루나가 다리를 다침"}
                  value={conv.statusTimeline}
                  onChange={e => dispatch({ type: 'updateStatusTimeline', convId: conv.id, value: e.target.value })}
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
