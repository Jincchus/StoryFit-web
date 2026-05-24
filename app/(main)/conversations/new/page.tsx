'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ParamTooltip from '@/components/ui/ParamTooltip'
import type { Character } from '@/types'

export default function NewConversationPage() {
  const router = useRouter()
  const { draft, dispatch } = useApp()
  const [char, setChar] = useState<Character | null>(null)
  const [allChars, setAllChars] = useState<Character[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'roleplay' | 'novel'>('roleplay')
  const [scenarioDescription, setScenarioDescription] = useState('')
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioHint, setScenarioHint] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagPool, setTagPool] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [charOpen, setCharOpen] = useState(false)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [safetyLevel, setSafetyLevel] = useState<'strict' | 'standard' | 'relaxed'>('standard')
  const [temperature, setTemperature] = useState(0.9)
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.3)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    fetch('/api/tags').then(r => r.json()).then(setTagPool).catch(() => {})
    api.get('/api/characters').then((chars: Character[]) => {
      setAllChars(chars)
      if (draft.charId) {
        const found = chars.find(c => c.id === draft.charId) ?? null
        if (found) {
          setChar(found)
          setSafetyLevel(found.safetyLevel ?? 'standard')
          setTemperature(found.temperature ?? 0.9)
          setFrequencyPenalty(found.frequencyPenalty ?? 0.3)
        }
      }
    }).catch(() => {})
  }, [draft.charId])

  const selectChar = (c: Character) => {
    setChar(c)
    setSafetyLevel(c.safetyLevel ?? 'standard')
    setTemperature(c.temperature ?? 0.9)
    setFrequencyPenalty(c.frequencyPenalty ?? 0.3)
    setCharOpen(false)
  }

  const selectedPersona = allChars.find(c => c.id === draft.personaId)

  const handleGenerateScenario = async () => {
    if (!char || scenarioLoading) return
    setScenarioLoading(true)
    try {
      const result = await api.post('/api/conversations/generate-scenario', {
        charName: char.name,
        charTags: char.tags,
        charInfo: char.additionalInfo,
        personaName: selectedPersona?.name,
        personaTags: selectedPersona?.tags,
        mode,
        hint: scenarioHint,
      })
      if (result.scenarioDescription) setScenarioDescription(result.scenarioDescription)
    } catch {
      // silent fail
    } finally {
      setScenarioLoading(false)
    }
  }

  const handleStart = async () => {
    if (!char || loading) return
    setLoading(true)
    try {
      const conv = await api.post('/api/conversations', {
        characterIds: [char.id],
        title: `${char.name}와의 대화`,
        currentAI: draft.modelId,
        personaCharacterId: draft.personaId ?? null,
        mode,
        scenarioDescription,
        tags,
        safetyLevel,
        temperature,
        frequencyPenalty,
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
          <div className="hstack" style={{ flexShrink: 0, flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <button className="btn ghost" onClick={() => router.back()}>← 뒤로</button>
            {!char && <span className="tiny muted">캐릭터를 선택하세요</span>}
            <button
              className="btn primary"
              disabled={!char || loading}
              onClick={handleStart}
            >
              {loading ? '...' : mode === 'novel' ? '✦ 소설 시작' : '✦ 롤플레이 시작'}
            </button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div className="new-conv-grid">

            {/* 1. 캐릭터 선택 */}
            <section className="new-conv-section">
              <div className="label">캐릭터 선택</div>
              <div
                className={`persona-option ${char ? 'selected' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setCharOpen(o => !o)}
              >
                {char ? (
                  <>
                    <div className="thumb" style={{ width: 32, height: 32 }}>
                      {char.avatarUrl
                        ? <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <PixelAvatar kind={char.kind} size={32} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 11 }}>{char.name}</div>
                      <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.tags?.slice(0, 3).join(' · ')}</div>
                    </div>
                  </>
                ) : (
                  <div className="tiny muted" style={{ flex: 1 }}>— 캐릭터를 선택하세요 —</div>
                )}
                <span style={{ fontSize: 9, color: 'var(--ink-soft)', flexShrink: 0 }}>{charOpen ? '▲' : '▼'}</span>
              </div>
              {charOpen && (
                <div style={{ border: '1px solid var(--chrome-border)', background: 'var(--win-bg)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                  {allChars.filter(c => c.id !== draft.personaId).map(c => (
                    <div
                      key={c.id}
                      className={`persona-option ${char?.id === c.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
                      onClick={() => selectChar(c)}
                    >
                      <div className="thumb" style={{ width: 28, height: 28 }}>
                        {c.avatarUrl
                          ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <PixelAvatar kind={c.kind} size={28} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 11 }}>{c.name}</div>
                        <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 3).join(' · ')}</div>
                      </div>
                      {char?.id === c.id && <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 2. 내 역할 (페르소나) */}
            <section className="new-conv-section">
              <div className="label">내 역할 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
              <div
                className="persona-option"
                style={{ cursor: 'pointer' }}
                onClick={() => setPersonaOpen(o => !o)}
              >
                {selectedPersona ? (
                  <>
                    <div className="thumb" style={{ width: 32, height: 32 }}>
                      {selectedPersona.avatarUrl
                        ? <img src={selectedPersona.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        : <PixelAvatar kind={selectedPersona.kind} size={28} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 11 }}>{selectedPersona.name}</div>
                      <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPersona.tags?.slice(0, 3).join(' · ')}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="thumb" style={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }}>
                      <PixelAvatar kind="player" size={28} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 11 }}>없음</div>
                      <div className="tiny muted">기본 유저로 대화</div>
                    </div>
                  </>
                )}
                <span style={{ fontSize: 9, color: 'var(--ink-soft)', flexShrink: 0 }}>{personaOpen ? '▲' : '▼'}</span>
              </div>
              {personaOpen && (
                <div style={{ border: '1px solid var(--chrome-border)', background: 'var(--win-bg)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                  <div
                    className={`persona-option ${!draft.personaId ? 'selected' : ''}`}
                    style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
                    onClick={() => { dispatch({ type: 'selectPersona', id: null }); setPersonaOpen(false) }}
                  >
                    <div className="thumb" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center' }}>
                      <PixelAvatar kind="player" size={24} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 11 }}>없음</div>
                      <div className="tiny muted">기본 유저로 대화</div>
                    </div>
                    {!draft.personaId && <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>}
                  </div>
                  {allChars.filter(c => c.id !== char?.id).map(c => (
                    <div
                      key={c.id}
                      className={`persona-option ${draft.personaId === c.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
                      onClick={() => { dispatch({ type: 'selectPersona', id: c.id }); setPersonaOpen(false) }}
                    >
                      <div className="thumb" style={{ width: 28, height: 28 }}>
                        {c.avatarUrl
                          ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <PixelAvatar kind={c.kind} size={24} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 11 }}>{c.name}</div>
                        <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 3).join(' · ')}</div>
                      </div>
                      {draft.personaId === c.id && <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. 대화 모드 */}
            <section className="new-conv-section">
              <div className="label">대화 모드</div>
              <div className="hstack" style={{ gap: 8 }}>
                {(['roleplay', 'novel'] as const).map(m => (
                  <button
                    key={m}
                    className={`btn ${mode === m ? 'primary' : 'ghost'}`}
                    onClick={() => setMode(m)}
                    style={{ fontSize: 11 }}
                  >
                    {m === 'roleplay' ? '⚔ 롤플레이' : '✍ 소설'}
                  </button>
                ))}
              </div>
              <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
                {mode === 'roleplay' && '나 ↔ 캐릭터 1:1 대화 형식'}
                {mode === 'novel' && '작가 시점 — 장면을 지시하면 AI가 나와 캐릭터가 함께 등장하는 장면을 써줍니다'}
              </div>
            </section>

            {/* 4. 시나리오 배경 */}
            <section className="new-conv-section">
              <div className="spread" style={{ alignItems: 'center', marginBottom: 6 }}>
                <div className="label" style={{ marginBottom: 0 }}>
                  시나리오 배경 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span>
                </div>
                <div className="hstack" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={() => setShowHint(v => !v)}
                  >
                    {showHint ? '힌트 접기' : '힌트'}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ fontSize: 10, padding: '2px 8px' }}
                    disabled={!char || scenarioLoading}
                    onClick={handleGenerateScenario}
                  >
                    {scenarioLoading ? '생성 중...' : '✦ AI 생성'}
                  </button>
                </div>
              </div>
              {showHint && (
                <input
                  className="field"
                  style={{ marginBottom: 6, fontSize: 11 }}
                  placeholder="생성 힌트 (선택): 마법학원, 재회, 비오는 밤..."
                  value={scenarioHint}
                  onChange={e => setScenarioHint(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGenerateScenario() } }}
                />
              )}
              <textarea
                className="field" rows={3}
                placeholder={"이 대화의 세계관·배경을 설정하세요\n예: 마법 학원 천문대, 루나는 오늘 밤 예언을 완성해야 한다."}
                value={scenarioDescription}
                onChange={e => setScenarioDescription(e.target.value)}
              />
            </section>

            {/* 5. 고급 설정 토글 */}
            <section className="new-conv-section" style={{ padding: '6px 0', borderTop: '1px solid var(--chrome-border)' }}>
              <button
                className="btn ghost"
                style={{ fontSize: 11, width: '100%', textAlign: 'left' }}
                onClick={() => setShowAdvanced(v => !v)}
              >
                {showAdvanced ? '▲' : '▼'} 고급 설정 (세계관 태그 · AI 파라미터)
              </button>
            </section>

            {showAdvanced && <>

            {/* 세계관 태그 */}
            <section className="new-conv-section">
              <div className="label">세계관 태그 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
              <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                <div className="tag-row" style={{ flexWrap: 'nowrap', gap: 5, width: 'max-content' }}>
                  {[...tagPool].sort((a, b) => a.localeCompare(b, 'ko')).map(tag => (
                    <span
                      key={tag}
                      className={`tag ${tags.includes(tag) ? 'tag-selected' : ''}`}
                      style={{ cursor: 'pointer', padding: '2px 7px', fontSize: 10, whiteSpace: 'nowrap' }}
                      onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                    >
                      {tags.includes(tag) ? '✓ ' : ''}{tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="hstack" style={{ gap: 6 }}>
                <input
                  className="field" style={{ flex: 1 }} placeholder="직접 입력..."
                  value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const t = tagInput.trim()
                      if (t && !tags.includes(t)) setTags(prev => [...prev, t])
                      setTagInput('')
                    }
                  }}
                />
                <button className="btn" onClick={() => {
                  const t = tagInput.trim()
                  if (t && !tags.includes(t)) setTags(prev => [...prev, t])
                  setTagInput('')
                }}>추가</button>
              </div>
              {tags.length > 0 && (
                <div className="tag-row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 4 }}>
                  {tags.map(t => (
                    <span key={t} className="tag tag-selected" style={{ cursor: 'pointer' }}
                      onClick={() => setTags(prev => prev.filter(x => x !== t))}>
                      {t} ×
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* AI 설정 */}
            <section className="new-conv-section">
              <div className="label">AI 설정</div>
              <div className="form-grid">
                <div>
                  <label className="label">
                    안전 수준
                    <ParamTooltip text={"AI가 민감한 내용을 얼마나 차단할지 결정합니다.\n\n엄격: 폭력·성인 표현 거의 차단\n표준: 일반적인 수준으로 차단 (기본값)\n완화: 성숙한 표현 일부 허용"} />
                  </label>
                  <select className="field" value={safetyLevel} onChange={e => setSafetyLevel(e.target.value as 'strict' | 'standard' | 'relaxed')}>
                    <option value="strict">엄격 (Strict)</option>
                    <option value="standard">표준 (Standard)</option>
                    <option value="relaxed">완화 (Relaxed)</option>
                  </select>
                </div>
              </div>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <div>
                  <label className="label">
                    창의성: {temperature.toFixed(1)}
                    <ParamTooltip text={"AI 답변의 창의성·무작위성을 조절합니다.\n\n낮을수록 (0~0.5): 일관되고 예측 가능한 답변\n보통 (0.7~1.0): 자연스럽고 다양한 표현 (추천)\n높을수록 (1.5~2.0): 창의적이지만 가끔 엉뚱한 답변"} />
                  </label>
                  <input type="range" className="param-slider" min={0} max={2} step={0.1} value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
                  <div className="spread" style={{ marginTop: 2 }}>
                    <span className="tiny muted">일관됨</span>
                    <span className="tiny muted">창의적</span>
                  </div>
                </div>
                <div>
                  <label className="label">
                    반복 억제: {frequencyPenalty.toFixed(2)}
                    <ParamTooltip text={"같은 단어나 표현이 반복되는 것을 억제합니다.\n\n낮을수록 (0~0.2): 반복 허용, 일관된 말투 유지\n보통 (0.3~0.5): 적당한 억제 (추천)\n높을수록 (0.8~): 다양한 어휘 사용, 말투 변할 수 있음"} />
                  </label>
                  <input type="range" className="param-slider" min={0} max={2} step={0.05} value={frequencyPenalty} onChange={e => setFrequencyPenalty(parseFloat(e.target.value))} />
                  <div className="spread" style={{ marginTop: 2 }}>
                    <span className="tiny muted">반복 허용</span>
                    <span className="tiny muted">강하게 억제</span>
                  </div>
                </div>
              </div>
            </section>

            </>}

          </div>
        </div>
      </div>
    </Win>
  )
}
