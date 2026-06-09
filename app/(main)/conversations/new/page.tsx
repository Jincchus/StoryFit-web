'use client'
import { useEffect, useState, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'
import ParamTooltip from '@/components/ui/ParamTooltip'
import type { Character } from '@/types'

export default function NewConversationPage() {
  return (
    <Suspense>
      <NewConversationInner />
    </Suspense>
  )
}

interface AlternativeGreeting {
  title: string
  text: string
}

function parseAlternativeGreetings(openingMessage: string, additionalInfo: string): AlternativeGreeting[] {
  const list: AlternativeGreeting[] = []
  if (openingMessage?.trim()) {
    list.push({ title: '기본 시작 상황', text: openingMessage.trim() })
  }
  
  const match = additionalInfo?.match(/\[다른 시작 상황\]\n([\s\S]*)/)
  if (match && match[1]) {
    const block = match[1]
    const intros = block.split(/\n\n(?=도입부: )/)
    for (const intro of intros) {
      const introLines = intro.split('\n')
      const titleLine = introLines[0] || ''
      if (titleLine.startsWith('도입부: ')) {
        const title = titleLine.replace('도입부: ', '').trim()
        const text = introLines.slice(1).join('\n').trim()
        if (title && text) {
          list.push({ title, text })
        }
      }
    }
  }
  return list
}

function NewConversationInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromId = searchParams.get('from')
  const { draft, dispatch } = useApp()
  const [char, setChar] = useState<Character | null>(null)
  const [allChars, setAllChars] = useState<Character[]>([])
  const [importedChars, setImportedChars] = useState<Character[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'roleplay' | 'novel' | 'story' | 'multiStory' | 'tikiTaka'>('story')
  const [statsEnabled, setStatsEnabled] = useState(false)
  const [statTagPool, setStatTagPool] = useState<string[]>([])
  const [selectedStats, setSelectedStats] = useState<string[]>([])
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
  const [scenarioDescription, setScenarioDescription] = useState('')
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioHint, setScenarioHint] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagPool, setTagPool] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [charOpen, setCharOpen] = useState(false)
  const [addCharOpen, setAddCharOpen] = useState(false)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [safetyLevel, setSafetyLevel] = useState<'strict' | 'standard' | 'relaxed'>('standard')
  const [temperature, setTemperature] = useState(0.9)
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.3)
  const [maxOutputTokens, setMaxOutputTokens] = useState(8192)
  const [thinkingBudget, setThinkingBudget] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [styleConfig, setStyleConfig] = useState<Record<string, string | null>>({
    pov: null, tense: null, mood: null, style: null, length: null, pace: null,
  })

  const toggleStyle = (key: string, val: string) =>
    setStyleConfig(s => ({ ...s, [key]: s[key] === val ? null : val }))

  useEffect(() => {
    Promise.all([
      fetch('/api/tags').then(r => r.json()),
      fetch('/api/stat-tags').then(r => r.json()),
      api.get('/api/characters'),
      api.get('/api/user/settings'),
    ]).then(([tagData, statTagData, chars, userSettings]) => {
      setTagPool(tagData)
      setStatTagPool(statTagData)
      setAllChars(chars)
      setMaxOutputTokens(userSettings.defaultMaxOutputTokens ?? 8192)
      setThinkingBudget(userSettings.defaultThinkingBudget ?? 0)
      if (draft.charId) {
        const found = chars.find((c: Character) => c.id === draft.charId) ?? null
        if (found) {
          setChar(found)
          setImportedChars([found])
          setSafetyLevel(found.safetyLevel ?? 'standard')
          setTemperature(found.temperature ?? 0.9)
          setFrequencyPenalty(found.frequencyPenalty ?? 0.3)
        }
      } else {
        setSafetyLevel(userSettings.defaultSafetyLevel ?? 'standard')
        setTemperature(userSettings.defaultTemperature ?? 0.9)
        setFrequencyPenalty(userSettings.defaultFrequencyPenalty ?? 0.3)
      }
    }).catch(() => {})
  }, [draft.charId])

  useEffect(() => {
    if (!fromId) return
    api.get(`/api/conversations/${fromId}`).then((conv: any) => {
      if (conv.scenarioDescription) setScenarioDescription(conv.scenarioDescription)
      if (Array.isArray(conv.tags) && conv.tags.length) setTags(conv.tags)
      if (conv.mode) setMode(conv.mode as any)
      const chars: Character[] = (conv.characters ?? [])
        .sort((a: any, b: any) => a.turnOrder - b.turnOrder)
        .map((cc: any) => cc.character)
        .filter(Boolean)
      if (chars.length > 0) {
        setImportedChars(chars)
        setChar(chars[0])
        dispatch({ type: 'selectChar', id: chars[0].id })
      }
    }).catch(() => {})
  }, [fromId])

  const selectChar = (c: Character) => {
    setChar(c)
    setImportedChars([c])
    setSafetyLevel(c.safetyLevel ?? 'standard')
    setTemperature(c.temperature ?? 0.9)
    setFrequencyPenalty(c.frequencyPenalty ?? 0.3)
    setCharOpen(false)
  }

  const removeImportedChar = (id: string) => {
    setImportedChars(prev => {
      const next = prev.filter(c => c.id !== id)
      if (char?.id === id) setChar(next[0] ?? null)
      return next
    })
  }

  const addImportedChar = (c: Character) => {
    setImportedChars(prev => [...prev, c])
    setAddCharOpen(false)
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
        worldTags: tags.length ? tags : undefined,
      })
      if (result.scenarioDescription) setScenarioDescription(result.scenarioDescription)
    } catch {
      // silent fail
    } finally {
      setScenarioLoading(false)
    }
  }

  const [altGreetings, setAltGreetings] = useState<{ title: string; text: string }[]>([])
  const [showGreetingModal, setShowGreetingModal] = useState(false)

  useEffect(() => {
    if (char) {
      const list = parseAlternativeGreetings(char.openingMessage || '', char.additionalInfo || '')
      setAltGreetings(list)
    } else {
      setAltGreetings([])
    }
  }, [char])

  const handleStart = async (chosenGreetingText?: string) => {
    if (!char || loading) return

    // 다중 도입부 상황 선택 모달 처리
    if (altGreetings.length > 1 && chosenGreetingText === undefined) {
      setShowGreetingModal(true)
      return
    }

    setLoading(true)
    try {
      const statsConfig = (mode === 'story' && statsEnabled && selectedStats.length > 0)
        ? selectedStats.map(name => ({ name, value: 50, min: 0, max: 100 }))
        : null

      const isMulti = mode === 'multiStory' || mode === 'tikiTaka'

      if (fromId) {
        await api.patch(`/api/conversations/${fromId}`, {
          mode,
          scenarioDescription,
          tags,
          isAutoCreated: false,
          personaCharacterId: draft.personaId ?? null,
          ...(isMulti ? { characterIds: importedChars.map(c => c.id) } : {}),
          ...(!isMulti && char ? { soloCharacterId: char.id } : {}),
        })
        router.push(`/conversations/${fromId}`)
        dispatch({ type: 'resetDraft' })
        return
      }

      const conv = await api.post('/api/conversations', {
        characterIds: isMulti ? importedChars.map(c => c.id) : [char.id],
        title: isMulti
          ? `${importedChars.map(c => c.name).join(', ')}의 대화`
          : `${char.name}와의 대화`,
        currentAI: draft.modelId,
        personaCharacterId: draft.personaId ?? null,
        mode,
        scenarioDescription,
        tags,
        safetyLevel,
        temperature,
        frequencyPenalty,
        maxOutputTokens,
        thinkingBudget,
        statsEnabled: (mode === 'story' || mode === 'multiStory') && statsEnabled && selectedStats.length > 0,
        statsConfig,
        inventoryEnabled: (mode === 'story' || mode === 'multiStory') && inventoryEnabled,
        styleConfig: Object.values(styleConfig).some(Boolean) ? styleConfig : null,
        openingMessage: chosenGreetingText ?? char.openingMessage,
      })
      router.push(`/conversations/${conv.id}`)
      dispatch({ type: 'resetDraft' })
    } catch {
      setLoading(false)
    }
  }

  return (
    <>
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
              onClick={() => handleStart()}
            >
              {loading ? '...' : fromId ? '✦ 설정 저장 후 시작' : mode === 'novel' ? '✦ 소설 시작' : mode === 'story' ? '✦ 스토리 시작' : '✦ 롤플레이 시작'}
            </button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div className="new-conv-grid">

            {/* 1. 캐릭터 선택 */}
            <section className="new-conv-section">
              <div className="label">캐릭터 선택</div>
              {(mode === 'multiStory' || mode === 'tikiTaka') && importedChars.length > 0 ? (
                /* 멀티스토리 — 캐릭터 목록 편집 가능 */
                <div className="vstack" style={{ gap: 4 }}>
                  {importedChars.map((c, i) => (
                    <div key={c.id} className="persona-option selected" style={{ cursor: 'default' }}>
                      <div className="thumb" style={{ width: 32, height: 32 }}>
                        {c.avatarUrl
                          ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <PixelAvatar kind={c.kind} size={32} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 11 }}>{c.name}</div>
                        <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 3).join(' · ')}</div>
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--hot-pink)', flexShrink: 0, marginRight: 4 }}>✓ {i + 1}</span>
                      <button
                        className="btn ghost"
                        style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }}
                        onClick={() => removeImportedChar(c.id)}
                      >✕</button>
                    </div>
                  ))}
                  {/* 캐릭터 추가 */}
                  <div style={{ position: 'relative' }}>
                    <button
                      className="btn ghost"
                      style={{ fontSize: 11, width: '100%' }}
                      onClick={() => setAddCharOpen(o => !o)}
                    >+ 캐릭터 추가 {addCharOpen ? '▲' : '▼'}</button>
                    {addCharOpen && (
                      <div style={{ border: '1px solid var(--chrome-border)', background: 'var(--win-bg)', maxHeight: 200, overflowY: 'auto' }}>
                        {allChars.filter(c => !importedChars.some(ic => ic.id === c.id)).length === 0 ? (
                          <div className="tiny muted" style={{ padding: '8px 12px' }}>추가할 수 있는 캐릭터가 없습니다</div>
                        ) : allChars.filter(c => !importedChars.some(ic => ic.id === c.id)).map(c => (
                          <div
                            key={c.id}
                            className="persona-option"
                            style={{ cursor: 'pointer', borderRadius: 0, borderBottom: '1px solid var(--chrome-border)' }}
                            onClick={() => addImportedChar(c)}
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* 단일 캐릭터 선택 */
                <>
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
                </>
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
                  {allChars.filter(c => (mode === 'multiStory' || mode === 'tikiTaka')
                    ? !importedChars.some(ic => ic.id === c.id)
                    : c.id !== char?.id
                  ).map(c => (
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
                {/* <button className={`btn ${mode === 'roleplay' ? 'primary' : 'ghost'}`} onClick={() => setMode('roleplay')} style={{ fontSize: 11 }}>⚔ 롤플레이</button> */}
                {/* <button className={`btn ${mode === 'novel' ? 'primary' : 'ghost'}`} onClick={() => setMode('novel')} style={{ fontSize: 11 }}>✍ 소설</button> */}
                <button className={`btn ${mode === 'story' ? 'primary' : 'ghost'}`} onClick={() => setMode('story')} style={{ fontSize: 11 }}>📖 스토리</button>
                <button className={`btn ${mode === 'multiStory' ? 'primary' : 'ghost'}`} onClick={() => setMode('multiStory')} style={{ fontSize: 11 }}>👥 멀티스토리</button>
                <button className={`btn ${mode === 'tikiTaka' ? 'primary' : 'ghost'}`} onClick={() => setMode('tikiTaka')} style={{ fontSize: 11 }}>👥 자유 대화(그룹)</button>
              </div>
              <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
                {mode === 'story' && '선택지 기반 인터랙티브 스토리 — AI가 장면을 쓰고 선택지를 제시합니다'}
                {mode === 'multiStory' && '다인 캐릭터 스토리 — 여러 캐릭터가 자연스럽게 상호작용하며 선택지를 제시합니다'}
                {mode === 'tikiTaka' && '자유 대화 (그룹) — 선택지 없이 여러 캐릭터가 소설식으로 번갈아 자유롭게 대화합니다'}
              </div>
              {(mode === 'story' || mode === 'multiStory') && (
                <div className="vstack" style={{ gap: 6, marginTop: 8, padding: '8px 10px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
                  <div className="spread" style={{ alignItems: 'center' }}>
                    <div className="tiny" style={{ fontWeight: 700 }}>관계·능력치 스탯</div>
                    <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={statsEnabled}
                        onChange={e => { setStatsEnabled(e.target.checked); if (!e.target.checked) setSelectedStats([]) }}
                      />
                      <span className="tiny">{statsEnabled ? 'ON' : 'OFF'}</span>
                    </label>
                  </div>
                  {statsEnabled && (
                    <>
                      <div className="tiny muted">스탯을 선택하면 대화 중 AI가 자동으로 수치를 조정합니다. (초기값 50/100)</div>
                      {statTagPool.length === 0 ? (
                        <div className="tiny muted">관리자가 등록한 스탯 태그가 없습니다.</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {statTagPool.map(name => (
                            <span
                              key={name}
                              className={`tag ${selectedStats.includes(name) ? 'tag-selected' : ''}`}
                              style={{ cursor: 'pointer', padding: '2px 8px', fontSize: 10 }}
                              onClick={() => setSelectedStats(prev =>
                                prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
                              )}
                            >
                              {selectedStats.includes(name) ? '✓ ' : ''}{name}
                            </span>
                          ))}
                        </div>
                      )}
                      {selectedStats.length > 0 && (
                        <div className="tiny muted">선택됨: {selectedStats.join(', ')}</div>
                      )}
                    </>
                  )}
                </div>
              )}
              {(mode === 'story' || mode === 'multiStory') && (
                <div className="vstack" style={{ gap: 6, marginTop: 6, padding: '8px 10px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
                  <div className="spread" style={{ alignItems: 'center' }}>
                    <div className="tiny" style={{ fontWeight: 700 }}>🎒 인벤토리 (아이템 파밍)</div>
                    <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={inventoryEnabled}
                        onChange={e => setInventoryEnabled(e.target.checked)}
                      />
                      <span className="tiny">{inventoryEnabled ? 'ON' : 'OFF'}</span>
                    </label>
                  </div>
                  {inventoryEnabled && (
                    <div className="tiny muted">스토리 진행 중 AI가 자동으로 아이템 획득·소모를 판단해 인벤토리를 관리합니다.</div>
                  )}
                </div>
              )}
            </section>

            {/* 4. 세계관 태그 */}
            <section className="new-conv-section">
              <div className="label">세계관 태그 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
              <div className="tag-scroll" style={{ overflowX: 'auto', paddingBottom: 4 }}>
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

            {/* 5. 시나리오 배경 */}
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

            {/* 5. 스타일 설정 */}
            <section className="new-conv-section">
              <div className="label">스타일 설정 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
              <div className="tiny muted" style={{ marginBottom: 8 }}>AI가 어떻게 쓸지를 조절합니다. 선택하지 않으면 AI가 자유롭게 판단합니다.</div>
              {([
                { key: 'pov',    label: '시점',     opts: ['1인칭', '3인칭'] },
                { key: 'tense',  label: '시제',     opts: ['현재형', '과거형'] },
                { key: 'mood',   label: '분위기',   opts: ['밝음', '중립', '어두움'] },
                { key: 'style',  label: '문체',     opts: ['문학적', '일상적', '극적'] },
                { key: 'length', label: '응답 길이', opts: ['짧게', '보통', '길게'] },
                { key: 'pace',   label: '전개 속도', opts: ['빠름', '보통', '느림'] },
              ] as const).map(({ key, label, opts }) => (
                <div key={key} className="hstack" style={{ gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, width: 60, flexShrink: 0 }}>{label}</span>
                  <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {opts.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        className={`btn ${styleConfig[key] === opt ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 10, padding: '2px 9px' }}
                        onClick={() => toggleStyle(key, opt)}
                      >{opt}</button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* 6. 고급 설정 토글 */}
            <section className="new-conv-section" style={{ padding: '6px 0', borderTop: '1px solid var(--chrome-border)' }}>
              <button
                className="btn ghost"
                style={{ fontSize: 11, width: '100%', textAlign: 'left' }}
                onClick={() => setShowAdvanced(v => !v)}
              >
                {showAdvanced ? '▲' : '▼'} 고급 설정 (AI 파라미터)
              </button>
            </section>

            {showAdvanced && <>

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
                <div>
                  <label className="label">
                    응답 최대 길이: {(maxOutputTokens / 1024).toFixed(0)}K (~{Math.round(maxOutputTokens / 2).toLocaleString()}자)
                    <ParamTooltip text={"AI 답변의 최대 길이를 조절합니다.\n\n낮을수록: 짧고 빠른 응답\n높을수록: 길고 깊이 있는 응답, 문장이 중간에 잘리는 일이 줄어듦 (생성 시간 ↑)\n\n한글 기준 약 1토큰=0.5자입니다."} />
                  </label>
                  <input type="range" className="param-slider" min={4096} max={32768} step={4096} value={maxOutputTokens} onChange={e => setMaxOutputTokens(parseInt(e.target.value))} />
                  <div className="spread" style={{ marginTop: 2 }}>
                    <span className="tiny muted">짧게</span>
                    <span className="tiny muted">길게</span>
                  </div>
                </div>
                <div>
                  <label className="label">
                    깊이감(사고): {thinkingBudget === 0 ? '끄기(빠름)' : `${(thinkingBudget / 1024).toFixed(1)}K`}
                    <ParamTooltip text={"답변 전에 AI가 장면을 설계하는 사고 예산입니다.\n\n끄기(0): 즉시 생성, 가장 빠름\n높을수록: 장면 구성·일관성·깊이 향상, 단 첫 응답까지 지연이 늘어남"} />
                  </label>
                  <input type="range" className="param-slider" min={0} max={8192} step={512} value={thinkingBudget} onChange={e => setThinkingBudget(parseInt(e.target.value))} />
                  <div className="spread" style={{ marginTop: 2 }}>
                    <span className="tiny muted">빠름</span>
                    <span className="tiny muted">깊게</span>
                  </div>
                </div>
              </div>
            </section>

            </>}

          </div>
        </div>
      </div>
    </Win>
    {showGreetingModal && altGreetings.length > 0 && createPortal(
      <>
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000 }}
          onClick={() => setShowGreetingModal(false)}
        />
        <div className="win" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9001, width: 'min(500px, 95vw)', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
          <div className="win-title">
            <div className="win-title-l"><span>📖 시작 상황(도입부) 선택</span></div>
            <div className="win-controls">
              <button onClick={() => setShowGreetingModal(false)}>×</button>
            </div>
          </div>
          <div className="win-body vstack" style={{ gap: 12, flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            <div className="tiny muted" style={{ marginBottom: 4, lineHeight: 1.5 }}>
              스토리의 시작점이 될 장면이나 챕터를 골라주세요.
            </div>
            <div className="vstack" style={{ gap: 8 }}>
              {altGreetings.map((g, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setShowGreetingModal(false)
                    handleStart(g.text)
                  }}
                  style={{
                    border: '1.5px solid var(--chrome-border)',
                    borderRadius: 'var(--radius)',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    background: 'var(--chrome-face)',
                    transition: 'border-color 0.2s, background-color 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--hot-pink)'
                    e.currentTarget.style.backgroundColor = 'var(--pane)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--chrome-border)'
                    e.currentTarget.style.backgroundColor = 'var(--chrome-face)'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--hot-pink)', marginBottom: 6 }}>
                    {g.title}
                  </div>
                  <div className="tiny" style={{ color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {g.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => setShowGreetingModal(false)}>취소</button>
            </div>
          </div>
        </div>
      </>,
      document.body
    )}
    </>
  )
}
