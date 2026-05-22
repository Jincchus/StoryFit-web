'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import { AI_MODELS } from '@/lib/constants'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import type { AIProvider, Character } from '@/types'

interface Persona { id: string; name: string; description: string; additionalInfo: string }

export default function NewConversationPage() {
  const router = useRouter()
  const { draft, dispatch } = useApp()
  const [char, setChar] = useState<Character | null>(null)
  const [allChars, setAllChars] = useState<Character[]>([])
  const [tikiChars, setTikiChars] = useState<Character[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'roleplay' | 'novel' | 'tikiTaka'>('roleplay')
  const [scenarioDescription, setScenarioDescription] = useState('')
  const startingRef = useRef(false)

  useEffect(() => {
    api.get('/api/personas').then(setPersonas).catch(() => {})
    api.get('/api/characters').then((chars: Character[]) => {
      setAllChars(chars)
      if (draft.charId) {
        const found = chars.find(c => c.id === draft.charId) ?? null
        if (found) { setChar(found); setTikiChars([found]) }
      }
    }).catch(() => {})
  }, [draft.charId])

  const selectChar = (id: string) => {
    const found = allChars.find(c => c.id === id) ?? null
    setChar(found)
    setTikiChars(found ? [found] : [])
  }

  const toggleTikiChar = (c: Character) => {
    if (c.id === char?.id) return
    setTikiChars(prev =>
      prev.find(x => x.id === c.id)
        ? prev.filter(x => x.id !== c.id)
        : [...prev, c],
    )
  }

  const handleStart = async () => {
    if (!char || loading) return
    setLoading(true)
    startingRef.current = true
    try {
      const characterIds = mode === 'tikiTaka'
        ? tikiChars.map(c => c.id)
        : [char.id]
      const conv = await api.post('/api/conversations', {
        characterIds,
        title: mode === 'tikiTaka'
          ? `${tikiChars.map(c => c.name).join(', ')}과의 대화`
          : `${char.name}와의 대화`,
        currentAI: draft.modelId,
        userPersonaId: draft.personaId ?? null,
        mode,
        scenarioDescription,
      })
      router.push(`/conversations/${conv.id}`)
      dispatch({ type: 'resetDraft' })
    } catch {
      setLoading(false)
    }
  }

  return (
    <Win title="새 대화 설정 (New Conversation)" icon={PixelIcons.chat}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0 }}>
        <div className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>대화를 시작하기 전에</div>
            <div className="tiny muted">캐릭터와 설정을 선택하세요</div>
          </div>
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6 }}>
            <button className="btn ghost" onClick={() => router.back()}>← 뒤로</button>
            <button
              className="btn primary"
              disabled={!char || loading || (mode === 'tikiTaka' && tikiChars.length < 2)}
              onClick={handleStart}
            >
              {loading ? '...' : mode === 'novel' ? '✦ 소설 시작' : mode === 'tikiTaka' ? '✦ 티키타카 시작' : '✦ 롤플레이 시작'}
            </button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div className="new-conv-grid">
            <section className="new-conv-section">
              <div className="label">캐릭터 선택</div>
              <div className="hstack" style={{ gap: 8, alignItems: 'center' }}>
                {char && (
                  <div className="thumb" style={{ flexShrink: 0 }}>
                    {char.avatarUrl
                      ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <PixelAvatar kind={char.kind} size={36} />
                    }
                  </div>
                )}
                <select
                  className="field"
                  style={{ flex: 1 }}
                  value={char?.id ?? ''}
                  onChange={e => selectChar(e.target.value)}
                >
                  <option value="">— 캐릭터를 선택하세요 —</option>
                  {allChars.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.title ? ` · ${c.title}` : ''}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="new-conv-section">
              <div className="label">대화 모드</div>
              <div className="hstack" style={{ gap: 8 }}>
                {(['roleplay', 'novel', 'tikiTaka'] as const).map(m => (
                  <button
                    key={m}
                    className={`btn ${mode === m ? 'primary' : 'ghost'}`}
                    onClick={() => setMode(m)}
                    style={{ fontSize: 11 }}
                  >
                    {m === 'roleplay' ? '⚔ 롤플레이' : m === 'novel' ? '✍ 소설' : '⟳ 티키타카'}
                  </button>
                ))}
              </div>
              <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
                {mode === 'roleplay' && '나 ↔ 캐릭터 1:1 대화 형식'}
                {mode === 'novel' && '작가 시점 — 장면을 지시하면 AI가 나와 캐릭터가 함께 등장하는 장면을 써줍니다'}
                {mode === 'tikiTaka' && '여러 캐릭터가 순서대로 번갈아 응답합니다 — 아래에서 참여 캐릭터를 선택하세요'}
              </div>
            </section>

            {mode === 'tikiTaka' && (
              <section className="new-conv-section">
                <div className="label">참여 캐릭터 <span className="muted" style={{ fontWeight: 400 }}>(순서 = 응답 순서)</span></div>
                <div className="tiny muted" style={{ marginBottom: 8 }}>
                  현재 선택: {tikiChars.map(c => c.name).join(' → ')}
                  {tikiChars.length < 2 && <span style={{ color: '#ff6b8a', marginLeft: 6 }}>최소 2명 필요</span>}
                </div>
                <div className="vstack" style={{ gap: 5 }}>
                  {allChars.map(c => {
                    const isMain = c.id === char?.id
                    const isIn = !!tikiChars.find(x => x.id === c.id)
                    const order = tikiChars.findIndex(x => x.id === c.id)
                    return (
                      <div
                        key={c.id}
                        className={`persona-option ${isIn ? 'selected' : ''}`}
                        style={{ cursor: isMain ? 'default' : 'pointer', opacity: isMain ? 0.8 : 1 }}
                        onClick={() => toggleTikiChar(c)}
                      >
                        <div className="thumb" style={{ width: 28, height: 28 }}>
                          {c.avatarUrl
                            ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            : <PixelAvatar kind={c.kind} size={28} />
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 11 }}>
                            {c.name}
                            {isMain && <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>(주 캐릭터)</span>}
                          </div>
                          <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                        </div>
                        {isIn && <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>#{order + 1}</span>}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <section className="new-conv-section">
              <div className="label">시나리오 배경 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
              <textarea
                className="field" rows={3}
                placeholder={"이 대화의 세계관·배경을 설정하세요\n예: 마법 학원 천문대, 루나는 오늘 밤 예언을 완성해야 한다."}
                value={scenarioDescription}
                onChange={e => setScenarioDescription(e.target.value)}
              />
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
