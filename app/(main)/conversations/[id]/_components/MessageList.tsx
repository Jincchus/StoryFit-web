'use client'
import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import { parseNovelBlocks } from '@/lib/parseBlocks'
import PixelAvatar from '@/components/ui/PixelAvatar'
import MessageBlocks from '@/components/ui/MessageBlocks'
import NovelScene from '@/components/ui/NovelScene'
import { parseStoryChoices, isSamePerson, type Msg, type Conv, type ConvChar, type BranchInfo } from '../_lib/chatShared'

const DICE_TAG_RE = /\n*🎲 판정 — (.+) → (대성공|성공|실패|대실패)\s*$/
const DICE_OUTCOME_CLASS: Record<string, string> = {
  대성공: 'crit', 성공: 'success', 실패: 'fail', 대실패: 'fumble',
}

function ChatNarration({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*|\n)/)
  return (
    <>
      {parts.map((p, i) =>
        p === '\n' ? <br key={i} />
        : p.startsWith('*') && p.endsWith('*')
          ? <em key={i}>{p.slice(1, -1)}</em>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

export default function MessageList({
  messages, conv, branches, convId, isMulti, isStoryOrMulti,
  typing, streaming, streamingChar, typingDuration,
  activeId, setActiveId, editingId, setEditingId,
  speakingId, speak, stopSpeaking,
  send, fillComposer, saveEdit, saveEditOnly,
  onRequestDelete, onToggleBookmark, onRegenerate, onBranchSwitch, onOpenBranchModal, onStopStream,
  getMsgChar,
  suggestions, suggestLoading, onRegenSuggestions,
}: {
  messages: Msg[]
  conv: Conv
  branches: BranchInfo[]
  convId: string
  isMulti: boolean
  isStoryOrMulti: boolean
  typing: boolean
  streaming: string
  streamingChar: ConvChar['character']
  typingDuration: number
  activeId: string | null
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>
  editingId: string | null
  setEditingId: (id: string | null) => void
  speakingId: string | null
  speak: (content: string, id: string) => void
  stopSpeaking: () => void
  send: (content?: string) => void
  fillComposer: (content: string) => void
  saveEdit: (content: string, msgId: string) => void
  saveEditOnly: (content: string, msgId: string) => void
  onRequestDelete: (msgId: string) => void
  onToggleBookmark: (msgId: string, next: boolean) => void
  onRegenerate: () => void
  onBranchSwitch: (targetMessageId: string) => Promise<void>
  onOpenBranchModal: (msgId: string) => void
  onStopStream: () => void
  getMsgChar: (m: Msg) => ConvChar['character']
  suggestions: string[]
  suggestLoading: boolean
  onRegenSuggestions: () => void
}) {
  const router = useRouter()
  const lastMsg = messages[messages.length - 1]
  const isLastAssistant = lastMsg?.role === 'assistant'

  return (
    <>
      {messages.map(m => {
        const isYou = m.role === 'user'
        const msgChar = getMsgChar(m)
        const isLast = m.id === lastMsg?.id
        const isEditing = editingId === m.id
        const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
        const charNames = conv.characters.map(cc => cc.character.name)
        const processedContent = !isYou
          ? replaceDisplayPlaceholders(m.content, personaName, charNames)
          : m.content
        const storyParsed = isStoryOrMulti && !isYou ? parseStoryChoices(processedContent) : null
        const blocks = isYou ? [] : parseNovelBlocks(storyParsed ? storyParsed.body : processedContent)
        const branchesFromHere = branches.filter(b => b.branchFromMessageId === m.id && b.id !== convId)

        return (
          <div key={m.id} id={`msg-${m.id}`}>
            {branchesFromHere.length > 0 && (
              <div style={{ display: 'flex', gap: 4, padding: '2px 4px 4px', flexWrap: 'wrap' }}>
                {branchesFromHere.map(b => (
                  <button
                    key={b.id}
                    className="btn ghost"
                    style={{ fontSize: 9, padding: '1px 7px', color: 'var(--accent, #0095f6)', borderColor: 'var(--accent, #0095f6)', opacity: 0.75 }}
                    onClick={e => { e.stopPropagation(); router.push(`/conversations/${b.id}`) }}
                  >
                    ⑂ v{b.version}{b.branchDescription ? ` · ${b.branchDescription}` : ''}
                  </button>
                ))}
              </div>
            )}
          {m.bookmarked && (
            <div style={{ textAlign: isYou ? 'right' : 'left', fontSize: 9, color: 'var(--hot-pink)', padding: '0 6px', lineHeight: 1 }}>🔖</div>
          )}
          <div
            className={`msg-seq${activeId === m.id ? ' active' : ''}`}
            onClick={() => setActiveId(prev => prev === m.id ? null : m.id)}
          >
            {isYou ? (
              /* ── 유저 메시지: 오른쪽 ── */
              <div className="seq-block seq-right">
                <div className="seq-speaker" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  {conv.personaCharacter?.name || conv.user?.displayName || '나'}
                  {conv.personaCharacter && (
                    <div className="thumb" style={{ width: 18, height: 18, flexShrink: 0 }}>
                      {conv.personaCharacter.avatarUrl
                        ? <img src={conv.personaCharacter.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                        : <PixelAvatar kind="player" size={18} />}
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <MessageEdit
                    initialContent={m.content}
                    isUser
                    onSave={c => saveEdit(c, m.id)}
                    onSaveOnly={c => saveEditOnly(c, m.id)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (() => {
                  const diceMatch = m.content.match(DICE_TAG_RE)
                  const body = diceMatch ? m.content.slice(0, diceMatch.index).trim() : m.content
                  return (
                    <>
                      {body && <div className="bubble bubble-persona" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>}
                      {diceMatch && (
                        <div className={`dice-badge dice-${DICE_OUTCOME_CLASS[diceMatch[2]]}`}>
                          🎲 {diceMatch[1]} → <b>{diceMatch[2]}</b>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            ) : isEditing ? (
              /* ── AI 편집 중 ── */
              <div className="seq-block seq-left">
                <div className="seq-speaker" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isMulti && (
                    <div className="thumb" style={{ width: 22, height: 22, flexShrink: 0 }}>
                      {msgChar.avatarUrl
                        ? <img src={msgChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                        : <PixelAvatar kind={msgChar.kind as any} size={22} />}
                    </div>
                  )}
                  <span>{msgChar.name}</span>
                </div>
                <MessageEdit
                  initialContent={m.content}
                  onSave={c => saveEdit(c, m.id)}
                  onSaveOnly={c => saveEditOnly(c, m.id)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : blocks.length > 0 ? (
              /* ── AI 메시지: 블록 순서대로 ── */
              <>
                {blocks.map((b, i) => {
                  if (b.type === 'image') {
                    return (
                      <div key={i} className="seq-block seq-center" style={{ width: '100%', padding: '4px 0' }}>
                        <img src={b.text} alt="" style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
                      </div>
                    )
                  }
                  if (b.type === 'system') {
                    return (
                      <div key={i} className="seq-block seq-center" style={{ margin: '8px 0', width: '100%' }}>
                        <div className="system-window-box">
                          <span className="system-tag">[SYSTEM]</span> {b.text}
                        </div>
                      </div>
                    )
                  }
                  if (b.type === 'constellation') {
                    return (
                      <div key={i} className="seq-block seq-center" style={{ margin: '10px 0', width: '100%' }}>
                        <div className="constellation-alert-box">
                          <span className="constellation-tag">✨ 성좌 알림 ✨</span>
                          <div className="constellation-text">{b.text}</div>
                        </div>
                      </div>
                    )
                  }
                  if (b.type === 'chat') {
                    const colonIdx = b.text.indexOf(':')
                    let sender = '시청자'
                    let messageBody = b.text
                    if (colonIdx !== -1) {
                      sender = b.text.slice(0, colonIdx).trim()
                      messageBody = b.text.slice(colonIdx + 1).trim()
                    }

                    const hash = sender.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                    const colors = ['#ff6b8a', '#ff9f43', '#10ac84', '#70a1ff', '#00d2d3', '#ff9ff3', '#00dec4', '#e84118', '#2ed573']
                    const nameColor = colors[hash % colors.length]

                    const isDonation = sender.includes('후원') || sender.includes('도네') || sender.includes('Coin') || sender.includes('코인')
                    const chatLineClass = isDonation ? 'livestream-chat-line donation' : 'livestream-chat-line'

                    return (
                      <div key={i} className="seq-block seq-center" style={{ width: '100%' }}>
                        <div className={chatLineClass}>
                          {isDonation && <span className="donation-badge">🍬 SPONSOR</span>}
                          <span className="chat-nickname" style={{ color: nameColor }}>{sender}</span>
                          <span className="chat-separator">: </span>
                          <span className="chat-text">{messageBody}</span>
                        </div>
                      </div>
                    )
                  }
                  if (b.type === 'narration') {
                    return (
                      <div key={i} className="seq-block seq-center">
                        <p className="seq-narration"><ChatNarration text={b.text} /></p>
                      </div>
                    )
                  }
                  const rawSpeaker = b.speaker || msgChar.name
                  const speaker = rawSpeaker.replace(/^\[|\]$/g, '').trim()
                  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
                  const isPersona = isSamePerson(speaker, personaName)
                  const isConvChar = conv.characters.some(cc => isSamePerson(speaker, cc.character.name))
                  const speakerChar = isMulti ? conv.characters.find(cc => isSamePerson(speaker, cc.character.name))?.character : undefined
                  const thought = b.type === 'thought' ? ' thought-bubble' : ''
                  if (isPersona) {
                    return (
                      <div key={i} className="seq-block seq-right">
                        <div className="seq-speaker">{speaker}</div>
                        <div className={`bubble bubble-persona${thought}`}>{b.text}</div>
                      </div>
                    )
                  }
                  const bubbleColor = isConvChar ? 'bubble-char' : 'bubble-third'
                  return (
                    <div key={i} className="seq-block seq-left">
                      <div className="seq-speaker" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {speakerChar && (
                          <div className="thumb" style={{ width: 22, height: 22, flexShrink: 0 }}>
                            {speakerChar.avatarUrl
                              ? <img src={speakerChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                              : <PixelAvatar kind={speakerChar.kind as any} size={22} />}
                          </div>
                        )}
                        <span>{speaker}</span>
                      </div>
                      <div className={`bubble ${bubbleColor}${thought}`}>{b.text}</div>
                    </div>
                  )
                })}
              </>
            ) : (
              /* ── 폴백: 파싱 불가 시 원본 표시 ── */
              <div className="seq-block seq-left">
                <div className="seq-speaker" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isMulti && (
                    <div className="thumb" style={{ width: 22, height: 22, flexShrink: 0 }}>
                      {msgChar.avatarUrl
                        ? <img src={msgChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                        : <PixelAvatar kind={msgChar.kind as any} size={22} />}
                    </div>
                  )}
                  <span>{msgChar.name}</span>
                </div>
                <div className="bubble bubble-char" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            )}

            {/* ── 추천 답변 칩 (스토리 선택지 대체, 채팅 스크롤 안에 표시) ── */}
            {isStoryOrMulti && !isYou && isLast && !typing && (suggestions.length > 0 || suggestLoading) && (
              <div className="vstack" style={{ gap: 5, marginTop: 8, paddingLeft: 4 }}>
                {suggestLoading && suggestions.length === 0 ? (
                  <div className="tiny muted" style={{ padding: '2px 4px' }}>추천 답변 생성 중…</div>
                ) : (
                  suggestions.map((choice, i) => (
                    <div key={i} className="hstack" style={{ gap: 4, alignItems: 'stretch' }}>
                      <button
                        className="btn ghost"
                        style={{ flex: 1, textAlign: 'left', fontSize: 11, padding: '5px 10px', lineHeight: 1.5, whiteSpace: 'normal' }}
                        onClick={() => send(choice)}
                      >{choice}</button>
                      <button
                        className="btn ghost"
                        style={{ fontSize: 10, padding: '0 7px', flexShrink: 0 }}
                        title="수정 후 전송"
                        onClick={() => fillComposer(choice)}
                      >✏</button>
                    </div>
                  ))
                )}
                {suggestions.length > 0 && (
                  <button
                    className="btn ghost"
                    style={{ fontSize: 10, padding: '3px 10px', opacity: 0.7, alignSelf: 'flex-start' }}
                    disabled={suggestLoading}
                    onClick={onRegenSuggestions}
                  >{suggestLoading ? '…' : '🔄 새로 생성'}</button>
                )}
              </div>
            )}
            {/* 이어쓰기 — 마지막 AI 응답이 짧을 때 (전 모드 공통) */}
            {!isYou && isLast && !typing && m.content.length < 350 && (
              <div style={{ paddingLeft: 4, marginTop: 4 }}>
                <button
                  className="btn ghost"
                  style={{ fontSize: 10, padding: '3px 10px', opacity: 0.7 }}
                  onClick={() => send('(계속 써줘)')}
                >계속 →</button>
              </div>
            )}

            {/* ── 호버/탭 액션 ── */}
            {!isEditing && (
              <div className={`msg-actions ${isYou ? 'you' : ''}`}>
                {/* 재생성 내비 — 첫 줄 중앙 */}
                {!isYou && (m.branchCount ?? 1) > 1 && m.siblingIds && (
                  <div className="msg-actions-row" style={{ justifyContent: 'center' }}>
                    <button className="msg-action-btn" style={{ padding: '1px 5px' }}
                      onClick={async () => {
                        const ids = m.siblingIds!
                        const idx = ids.indexOf(m.id)
                        const prevId = ids[(idx - 1 + ids.length) % ids.length]
                        if (prevId !== m.id) await onBranchSwitch(prevId)
                      }}>←</button>
                    <span className="tiny muted" style={{ fontSize: 9 }}>{m.branchIndex}/{m.branchCount}</span>
                    <button className="msg-action-btn" style={{ padding: '1px 5px' }}
                      onClick={async () => {
                        const ids = m.siblingIds!
                        const idx = ids.indexOf(m.id)
                        const nextId = ids[(idx + 1) % ids.length]
                        if (nextId !== m.id) await onBranchSwitch(nextId)
                      }}>→</button>
                  </div>
                )}
                {/* 액션 버튼 — 둘째 줄 */}
                <div className="msg-actions-row">
                  {isLast && isLastAssistant && !isYou && (
                    <button className="msg-action-btn" aria-label="재생성" onClick={onRegenerate}>↺ 재생성</button>
                  )}
                  {!isYou && (
                    <button
                      className="msg-action-btn"
                      style={{ color: speakingId === m.id ? 'var(--pink)' : undefined }}
                      aria-label={speakingId === m.id ? '읽기 정지' : '소리로 읽기'}
                      onClick={() => speakingId === m.id ? stopSpeaking() : speak(m.content, m.id)}
                    >{speakingId === m.id ? '■ 정지' : '🔊'}</button>
                  )}
                  <button
                    className="msg-action-btn"
                    style={{ color: m.bookmarked ? 'var(--hot-pink)' : undefined }}
                    aria-label={m.bookmarked ? '북마크 해제' : '북마크'}
                    onClick={() => onToggleBookmark(m.id, !m.bookmarked)}
                  >{m.bookmarked ? '🔖 해제' : '🔖'}</button>
                  <button className="msg-action-btn" aria-label="편집" onClick={() => setEditingId(m.id)}>✏ 편집</button>
                  <button
                    className="msg-action-btn"
                    aria-label="분기 만들기"
                    onClick={() => onOpenBranchModal(m.id)}
                  >⑂ 분기</button>
                  <button className="msg-action-btn danger" aria-label="메시지 삭제" onClick={() => onRequestDelete(m.id)}>✕ 삭제</button>
                </div>
              </div>
            )}
            {/* 토큰 사용량 — 마지막 AI 메시지에만 */}
            {isLast && !isYou && (m.inputTokens ?? 0) > 0 && (
              <div style={{ fontSize: 9, color: 'var(--ink-soft)', opacity: 0.55, paddingLeft: 4, marginTop: 2 }}>
                in {m.inputTokens?.toLocaleString()} / out {m.outputTokens?.toLocaleString()} tok
              </div>
            )}
          </div>
          </div>
        )
      })}

      {(typing || streaming) && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className="msg-seq">
          <div className="seq-block seq-left">
            <div className="seq-speaker" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className="thumb" style={{ width: 20, height: 20, flexShrink: 0 }}>
                {streamingChar.avatarUrl
                  ? <img src={streamingChar.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} alt="" />
                  : <PixelAvatar kind={streamingChar.kind as any} size={20} />}
              </div>
              <span>{streamingChar.name}{!streaming && '이(가) 쓰는 중'}</span>
            </div>
            {streaming
              ? <>
                  {(() => {
                    const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
                    const charNames = conv.characters.map(cc => cc.character.name)
                    const ps = replaceDisplayPlaceholders(streaming, personaName, charNames)
                    return isMulti
                      ? <NovelScene text={ps} personaName={personaName} charName={streamingChar.name} />
                      : <MessageBlocks text={ps} />
                  })()}
                  {typingDuration >= 8 && (
                    <div className="tiny" style={{ opacity: 0.6, marginTop: 4, fontStyle: 'italic' }}>✦ 다듬는 중…</div>
                  )}
                </>
              : <div className="bubble dots" style={{ fontSize: 18, letterSpacing: 3, padding: '6px 10px' }}>
                  {typingDuration >= 3
                    ? <span style={{ fontSize: 11, letterSpacing: 0, opacity: 0.7 }}>{typingDuration}초째 생성 중...</span>
                    : <><span>•</span><span>•</span><span>•</span></>
                  }
                </div>
            }
          </div>
          <button className="msg-action-btn" style={{ alignSelf: 'flex-start', marginTop: 2 }} onClick={onStopStream}>■ 중단</button>
        </div>
      )}
    </>
  )
}

function MessageEdit({ initialContent, isUser, onSave, onSaveOnly, onCancel }: {
  initialContent: string
  isUser?: boolean
  onSave: (content: string) => void
  onSaveOnly: (content: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const get = () => ref.current?.value ?? ''
  return (
    <div className="vstack" style={{ gap: 4, alignItems: isUser ? 'flex-end' : undefined }}>
      <textarea
        ref={ref}
        className="field" rows={3}
        defaultValue={initialContent}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(get()) } }}
        autoFocus
        style={{ minWidth: isUser ? 200 : 0 }}
      />
      <div className="hstack" style={{ gap: 4 }}>
        {isUser ? (
          <>
            <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSave(get())}>저장 + 재생성</button>
            <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSaveOnly(get())}>저장만</button>
          </>
        ) : (
          <>
            <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSaveOnly(get())}>저장만</button>
            <button className="btn primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => onSave(get())}>저장 + 재생성</button>
          </>
        )}
        <button className="btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
