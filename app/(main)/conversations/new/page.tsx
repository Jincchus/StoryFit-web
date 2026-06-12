'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useApp } from '@/providers/AppProvider'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import type { Character } from '@/types'
import { parseAlternativeGreetings, type AlternativeGreeting } from './_lib/greetings'
import CharacterSection from './_components/CharacterSection'
import PersonaSection from './_components/PersonaSection'
import ModeSection from './_components/ModeSection'
import TagsSection from './_components/TagsSection'
import ScenarioSection from './_components/ScenarioSection'
import StyleSection from './_components/StyleSection'
import AdvancedParamsSection from './_components/AdvancedParamsSection'
import GreetingModal from './_components/GreetingModal'

export default function NewConversationPage() {
  return (
    <Suspense>
      <NewConversationInner />
    </Suspense>
  )
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
  const [mode, setMode] = useState<'story' | 'multiStory'>('story')
  const [statsEnabled, setStatsEnabled] = useState(false)
  const [statTagPool, setStatTagPool] = useState<string[]>([])
  const [selectedStats, setSelectedStats] = useState<string[]>([])
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
  const [autoChapterEnabled, setAutoChapterEnabled] = useState(false)
  const [plotEnabled, setPlotEnabled] = useState(false)
  const [plotChapters, setPlotChapters] = useState(6)
  const [scenarioDescription, setScenarioDescription] = useState('')
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagPool, setTagPool] = useState<string[]>([])
  const [safetyLevel, setSafetyLevel] = useState<'strict' | 'standard' | 'relaxed'>('standard')
  const [temperature, setTemperature] = useState(0.9)
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.3)
  const [maxOutputTokens, setMaxOutputTokens] = useState(8192)
  const [thinkingBudget, setThinkingBudget] = useState(0)
  const [styleConfig, setStyleConfig] = useState<Record<string, string | null>>({
    pov: null, tense: null, mood: null, style: null, length: null, pace: null,
  })
  const [altGreetings, setAltGreetings] = useState<AlternativeGreeting[]>([])
  const [showGreetingModal, setShowGreetingModal] = useState(false)

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
  }

  const selectedPersona = allChars.find(c => c.id === draft.personaId)

  const handleGenerateScenario = async (hint: string) => {
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
        hint,
        worldTags: tags.length ? tags : undefined,
      })
      if (result.scenarioDescription) setScenarioDescription(result.scenarioDescription)
    } catch {
      // silent fail
    } finally {
      setScenarioLoading(false)
    }
  }

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

      const isMulti = mode === 'multiStory'

      if (fromId) {
        await api.patch(`/api/conversations/${fromId}`, {
          mode,
          scenarioDescription,
          tags,
          isAutoCreated: false,
          autoChapterEnabled: (mode === 'story' || mode === 'multiStory') && autoChapterEnabled,
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
        autoChapterEnabled: (mode === 'story' || mode === 'multiStory') && autoChapterEnabled,
        styleConfig: Object.values(styleConfig).some(Boolean) ? styleConfig : null,
        openingMessage: chosenGreetingText ?? char.openingMessage,
        ...(plotEnabled ? { plotChapters } : {}),
      })
      router.push(`/conversations/${conv.id}`)
      dispatch({ type: 'resetDraft' })
    } catch {
      setLoading(false)
    }
  }

  return (
    <>
    <Win title="새 대화 설정 (New Conversation)" icon={<span style={{fontSize:'18px'}}>✨</span>}>
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
              {loading ? '...' : fromId ? '✦ 설정 저장 후 시작' : mode === 'story' ? '✦ 스토리 시작' : '✦ 멀티스토리 시작'}
            </button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div className="new-conv-grid">

            <CharacterSection
              mode={mode}
              char={char}
              importedChars={importedChars}
              allChars={allChars}
              personaId={draft.personaId ?? null}
              onSelectChar={selectChar}
              onAddChar={addImportedChar}
              onRemoveChar={removeImportedChar}
            />

            <PersonaSection
              mode={mode}
              char={char}
              importedChars={importedChars}
              allChars={allChars}
              personaId={draft.personaId ?? null}
              onSelect={id => dispatch({ type: 'selectPersona', id })}
            />

            <ModeSection
              mode={mode}
              setMode={setMode}
              statsEnabled={statsEnabled}
              setStatsEnabled={setStatsEnabled}
              statTagPool={statTagPool}
              selectedStats={selectedStats}
              setSelectedStats={setSelectedStats}
              inventoryEnabled={inventoryEnabled}
              setInventoryEnabled={setInventoryEnabled}
              autoChapterEnabled={autoChapterEnabled}
              setAutoChapterEnabled={setAutoChapterEnabled}
              plotEnabled={plotEnabled}
              setPlotEnabled={setPlotEnabled}
              plotChapters={plotChapters}
              setPlotChapters={setPlotChapters}
            />

            <TagsSection tags={tags} setTags={setTags} tagPool={tagPool} />

            <ScenarioSection
              value={scenarioDescription}
              onChange={setScenarioDescription}
              onGenerate={handleGenerateScenario}
              loading={scenarioLoading}
              canGenerate={!!char}
            />

            <StyleSection styleConfig={styleConfig} onToggle={toggleStyle} />

            <AdvancedParamsSection
              safetyLevel={safetyLevel}
              setSafetyLevel={setSafetyLevel}
              temperature={temperature}
              setTemperature={setTemperature}
              frequencyPenalty={frequencyPenalty}
              setFrequencyPenalty={setFrequencyPenalty}
              maxOutputTokens={maxOutputTokens}
              setMaxOutputTokens={setMaxOutputTokens}
              thinkingBudget={thinkingBudget}
              setThinkingBudget={setThinkingBudget}
            />

          </div>
        </div>
      </div>
    </Win>
    {showGreetingModal && altGreetings.length > 0 && (
      <GreetingModal
        greetings={altGreetings}
        onPick={text => { setShowGreetingModal(false); handleStart(text) }}
        onClose={() => setShowGreetingModal(false)}
      />
    )}
    </>
  )
}
