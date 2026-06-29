'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import PixelAvatar from '@/components/ui/PixelAvatar'
import ModelPill from '@/components/ui/ModelPill'
import { replaceDisplayPlaceholders } from '@/lib/josa'
import type { Character } from '@/types'
import CommandGuide from '@/components/ui/CommandGuide'
import { useLorebook } from '../_hooks/useLorebook'
import { useMemoryPanel } from '../_hooks/useMemoryPanel'
import type { Conv, ConvChar, LbEntry, BranchInfo } from '../_lib/chatShared'

export default function SidePanel({
  convId, conv, setConv, allChars, branches, customBg, setCustomBg, currentTheme, setCurrentTheme,
  debouncedPatch, setToast, onShowCharCard, onJumpToMessage, onClose, onChangeModel,
}: {
  convId: string
  conv: Conv
  setConv: React.Dispatch<React.SetStateAction<Conv | null>>
  allChars: Character[]
  branches: BranchInfo[]
  customBg: string
  setCustomBg: (v: string) => void
  currentTheme: string
  setCurrentTheme: (v: string) => void
  debouncedPatch: (field: string, value: string | number) => void
  setToast: (msg: string) => void
  onShowCharCard: (c: ConvChar['character']) => void
  onJumpToMessage: (msgId: string) => void
  onClose: () => void
  onChangeModel: (id: string) => void
}) {
  const [tab, setTab] = useState<'basic' | 'ai' | 'memory' | 'world'>('basic')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
  const charNames = conv.characters.map(cc => cc.character.name)
  const display = (text: string) => replaceDisplayPlaceholders(text, personaName, charNames)
  const [panelOpen, setPanelOpen] = useState<Record<string, boolean>>({ memory: true, lorebook: false, branch: false, style: false, persona: false })
  const [infoTip, setInfoTip] = useState<string | null>(null)

  const [cmds, setCmds] = useState<{ id: string; name: string; instruction: string; description: string }[]>([])
  const [cmdName, setCmdName] = useState('')
  const [cmdInstr, setCmdInstr] = useState('')
  const [cmdDesc, setCmdDesc] = useState('')
  const [cmdMsg, setCmdMsg] = useState('')
  const loadCmds = () => { api.get('/api/commands').then(setCmds).catch(() => {}) }
  useEffect(() => { loadCmds() }, [])
  const saveCmd = async () => {
    try {
      await api.post('/api/commands', { name: cmdName, instruction: cmdInstr, description: cmdDesc })
      setCmdName(''); setCmdInstr(''); setCmdDesc(''); setCmdMsg('✓ 추가됨'); loadCmds()
    } catch (e: any) { setCmdMsg(`⚠ ${e.message ?? '실패'}`) }
  }
  const delCmd = async (id: string) => {
    if (!confirm('이 커맨드를 삭제할까요?')) return
    try { await api.delete(`/api/commands/${id}`); loadCmds() }
    catch (e: any) { setCmdMsg(`⚠ ${e?.message ?? '삭제 실패'}`) }
  }

  const {
    lorebooks, lorebookAdd, setLorebookAdd,
    lorebookEditId, setLorebookEditId,
    lbForm, setLbForm,
    lorebookError,
    handleAddLorebook, handlePatchLorebook, handleDeleteLorebook,
    showLorebookImport, setShowLorebookImport,
    lorebookImportText, setLorebookImportText,
    lorebookImporting, handleImportLorebook,
  } = useLorebook(convId, setToast)

  const applyServerCoreMemory = (value: string) => {
    setConv(c => c ? { ...c, coreMemory: value } : c)
  }

  const {
    memories, memoryError, promoting,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories, handleUnpromoteMemory,
    toggleMemorySelect, toggleExpandPromoted,
  } = useMemoryPanel(convId, setToast, applyServerCoreMemory)

  const handleTitleSave = async () => {
    if (!titleInput.trim() || !conv) return
    try {
      await api.patch(`/api/conversations/${convId}`, { title: titleInput.trim() })
      setConv(c => c ? { ...c, title: titleInput.trim() } : c)
      setEditingTitle(false)
    } catch { setToast('제목 저장에 실패했습니다') }
  }

  const handlePersonaChange = async (charId: string | null) => {
    try {
      await api.patch(`/api/conversations/${convId}`, { personaCharacterId: charId })
      const found = allChars.find(c => c.id === charId) ?? null
      setConv(c => c ? { ...c, personaCharacter: found ? { id: found.id, name: found.name, avatarUrl: found.avatarUrl ?? null, tags: found.tags ?? [], additionalInfo: found.additionalInfo ?? '' } : null } : c)
    } catch { setToast('페르소나 변경에 실패했습니다') }
  }

  const handleStyleConfig = (key: string, val: string) => {
    const next = { ...(conv?.styleConfig ?? {}), [key]: conv?.styleConfig?.[key] === val ? null : val }
    setConv(c => c ? { ...c, styleConfig: next } : c)
    api.patch(`/api/conversations/${convId}`, { styleConfig: next }).catch(() => setToast('스타일 저장에 실패했습니다'))
  }
  const setLength = (patch: { min?: number; max?: number }) => {
    const cur = ((conv?.styleConfig as any)?.length ?? {}) as { min?: number; max?: number }
    const next = { ...(conv?.styleConfig ?? {}), length: { ...cur, ...patch } }
    setConv(c => c ? { ...c, styleConfig: next } : c)
    api.patch(`/api/conversations/${convId}`, { styleConfig: next }).catch(() => setToast('스타일 저장에 실패했습니다'))
  }

  const handleParam = (field: 'temperature' | 'frequencyPenalty' | 'maxOutputTokens' | 'thinkingBudget', value: number) => {
    setConv(c => c ? { ...c, [field]: value } : c)
    debouncedPatch(field, value)
  }

  const handleSafety = (value: string) => {
    setConv(c => c ? { ...c, safetyLevel: value } : c)
    api.patch(`/api/conversations/${convId}`, { safetyLevel: value }).catch(() => setToast('설정 저장에 실패했습니다'))
  }

  const handleCoreMemory = (value: string) => {
    setConv(c => c ? { ...c, coreMemory: value } : c)
    debouncedPatch('coreMemory', value)
  }

  const handleStatusTimeline = (value: string) => {
    setConv(c => c ? { ...c, statusTimeline: value } : c)
    debouncedPatch('statusTimeline', value)
  }

  const handleScenarioDescription = (value: string) => {
    setConv(c => c ? { ...c, scenarioDescription: value } : c)
    debouncedPatch('scenarioDescription', value)
  }

  const handleBranchDescription = (value: string) => {
    setConv(c => c ? { ...c, branchDescription: value } : c)
    debouncedPatch('branchDescription', value)
  }

  return (
    <>
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9 }}
      onClick={onClose}
    />
    <div className="side-panel">
      {/* 고정 헤더: 제목 + 🤖 모델 + 4탭 — 스크롤해도 항상 보임 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--paper)', margin: '-10px -10px 0', padding: '10px 10px 0' }}>
        <div className="side-panel-header spread">
          <span style={{ fontWeight: 700, fontSize: 11 }}>대화 설정</span>
          <button className="btn ghost" style={{ padding: '1px 5px', fontSize: 11 }} aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <div className="hstack" style={{ gap: 6, alignItems: 'center', padding: '8px 0 2px' }}>
          <span className="tiny muted" style={{ flexShrink: 0 }}>🤖 모델</span>
          <ModelPill value={conv.chatModel} onChange={onChangeModel} />
        </div>

        <div className="hstack" style={{ gap: 2, padding: '6px 0 8px', borderBottom: '1px solid var(--hairline)' }}>
          {([['basic', '기본'], ['ai', 'AI응답'], ['memory', '기억'], ['world', '세계관']] as const).map(([k, lbl]) => (
            <button
              key={k}
              className={`btn ${tab === k ? 'primary' : 'ghost'}`}
              style={{ flex: 1, fontSize: 11, padding: '5px 0', justifyContent: 'center' }}
              onClick={() => setTab(k)}
            >{lbl}</button>
          ))}
        </div>
      </div>

      {branches.length > 1 && (
        <div className="side-section" hidden={tab !== 'basic'}>
          <div className="label">분기 설명 <span className="tiny muted">(현재 버전: v{branches.find(b => b.id === convId)?.version ?? 1})</span></div>
          <input
            className="field"
            style={{ fontSize: 11 }}
            placeholder="예: 루나가 거절하는 방향"
            value={display(conv.branchDescription ?? '')}
            onChange={e => handleBranchDescription(e.target.value)}
            maxLength={100}
          />
        </div>
      )}

      <div className="side-section" hidden={tab !== 'basic'}>
        <div className="label">대화 제목</div>
        {editingTitle ? (
          <div className="hstack" style={{ gap: 4 }}>
            <input
              className="field" style={{ flex: 1, fontSize: 11 }}
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false) }}
              autoFocus
            />
            <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} onClick={handleTitleSave}>저장</button>
            <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => setEditingTitle(false)}>취소</button>
          </div>
        ) : (
          <div className="spread" style={{ gap: 4 }}>
            <div className="tiny" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
            <button className="msg-action-btn" style={{ fontSize: 9 }} onClick={() => { setTitleInput(conv.title); setEditingTitle(true) }}>✏</button>
          </div>
        )}
      </div>

      <div className="side-section" hidden={tab !== 'basic'}>
        <div className="label">대화방 배경 이미지 (URL)</div>
        <div className="hstack" style={{ gap: 4 }}>
          <input
            className="field"
            style={{ fontSize: 11, flex: 1 }}
            placeholder="https://example.com/image.jpg"
            value={customBg}
            onChange={e => {
              const val = e.target.value
              setCustomBg(val)
              localStorage.setItem('sf_bg_' + convId, val)
            }}
          />
          {customBg && (
            <button
              className="btn ghost"
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => {
                setCustomBg('')
                localStorage.removeItem('sf_bg_' + convId)
              }}
            >✕</button>
          )}
        </div>
      </div>

      <div className="side-section" hidden={tab !== 'basic'}>
        <div className="label">대화 참여자</div>
        <div className="vstack" style={{ gap: 4 }}>
          {conv.characters.map(cc => (
            <div
              key={cc.character.id}
              className="hstack"
              style={{ gap: 6, padding: '4px 0', cursor: 'pointer' }}
              onClick={() => onShowCharCard(cc.character)}
            >
              <div className="thumb" style={{ width: 22, height: 22, flexShrink: 0 }}>
                {cc.character.avatarUrl
                  ? <img src={cc.character.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <PixelAvatar kind={cc.character.kind as any} size={22} />
                }
              </div>
              <div style={{ fontSize: 10, fontWeight: 700 }}>{cc.character.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="side-section" hidden={tab !== 'basic'}>
        <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, persona: !o.persona }))}>
          <span>내 역할</span>
          <span className={`acc-arrow ${panelOpen.persona ? 'open' : ''}`}>▼</span>
        </button>
        {!panelOpen.persona && (
          <div className="hstack" style={{ gap: 6, padding: '4px 0', opacity: 0.75 }}>
            <div className="thumb" style={{ width: 18, height: 18, flexShrink: 0 }}>
              {conv.personaCharacter?.avatarUrl
                ? <img src={conv.personaCharacter.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                : <PixelAvatar kind={conv.personaCharacter ? (conv.personaCharacter as any).kind ?? 'player' : 'player'} size={16} />}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.personaCharacter ? conv.personaCharacter.name : '없음 (기본 유저)'}
            </div>
            <span style={{ color: 'var(--hot-pink)', fontSize: 10, flexShrink: 0 }}>✓</span>
          </div>
        )}
        {panelOpen.persona && (
        <div className="vstack" style={{ gap: 4, marginTop: 6 }}>
          <div
            className={`persona-option ${!conv.personaCharacter ? 'selected' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => handlePersonaChange(null)}
          >
            <div className="thumb" style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <PixelAvatar kind="player" size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 10 }}>없음</div>
              <div className="tiny muted">기본 유저</div>
            </div>
            {!conv.personaCharacter && <span style={{ color: 'var(--hot-pink)', fontSize: 10 }}>✓</span>}
          </div>
          {allChars.filter(c => !conv.characters.some(cc => cc.character.id === c.id)).map(c => (
            <div
              key={c.id}
              className={`persona-option ${conv.personaCharacter?.id === c.id ? 'selected' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => handlePersonaChange(c.id)}
            >
              <div className="thumb" style={{ width: 22, height: 22, flexShrink: 0 }}>
                {c.avatarUrl
                  ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} alt="" />
                  : <PixelAvatar kind={c.kind as any} size={20} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 10 }}>{c.name}</div>
                <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tags?.slice(0, 2).join(' · ')}</div>
              </div>
              {conv.personaCharacter?.id === c.id && <span style={{ color: 'var(--hot-pink)', fontSize: 10 }}>✓</span>}
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="side-section" hidden={tab !== 'basic'}>
        <div className="label">내 커맨드</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
          나만의 AI 커맨드를 만들면 채팅에서 <code>!이름</code>으로 실행됩니다.
        </div>
        {cmds.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>!{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description || c.instruction}</div>
            </div>
            <button onClick={() => delCmd(c.id)} style={{ flexShrink: 0, background: 'none', border: 'none', color: '#ff6b8a', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <input className="field" placeholder="이름 (예: 에타)" value={cmdName} onChange={e => setCmdName(e.target.value)} />
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 700 }}>지시문 <CommandGuide /></div>
          <textarea className="field" rows={3} placeholder="현재 상황을 확인해 ... 마크다운으로 작성하라" value={cmdInstr} onChange={e => setCmdInstr(e.target.value)} style={{ resize: 'vertical', fontSize: 12 }} />
          <input className="field" placeholder="설명(선택, 자동완성에 표시)" value={cmdDesc} onChange={e => setCmdDesc(e.target.value)} />
          <button className="btn" onClick={saveCmd} disabled={!cmdName.trim() || !cmdInstr.trim()}>+ 커맨드 추가</button>
          {cmdMsg && <div style={{ fontSize: 11, color: cmdMsg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{cmdMsg}</div>}
        </div>
      </div>

      <div className="side-section" hidden={tab !== 'world'}>
        <div className="spread" style={{ marginBottom: 4 }}>
          <div className="label" style={{ marginBottom: 0 }}>시나리오 배경</div>
          <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => setInfoTip(t => t === 'scenario' ? null : 'scenario')}>?</button>
        </div>
        {infoTip === 'scenario' && (
          <div className="info-tip">이 대화의 세계관·장소·상황을 설명합니다. AI가 대화를 시작하기 전에 읽는 배경 정보입니다.{'\n\n'}예: "현대 판타지 세계. 주인공은 마법 고등학교 3학년이다. 오늘은 수능 전날 밤."</div>
        )}
        <textarea
          className="field" rows={3}
          placeholder={"이 대화의 세계관·배경을 설정하세요\n예: 마법 학원 천문대, 루나는 오늘 밤 예언을 완성해야 한다."}
          value={display(conv.scenarioDescription)}
          onChange={e => handleScenarioDescription(e.target.value)}
        />
      </div>

      <div className="side-section" hidden={tab !== 'world'}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="label" style={{ marginBottom: 0 }}>🔖 AI 자동 챕터 구분</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={conv.autoChapterEnabled ?? false}
              onChange={async e => {
                const checked = e.target.checked
                try {
                  await api.patch(`/api/conversations/${convId}`, { autoChapterEnabled: checked })
                  setConv(c => c ? { ...c, autoChapterEnabled: checked } : c)
                } catch { setToast('설정 저장에 실패했습니다') }
              }}
            />
            <span className="tiny">{conv.autoChapterEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>장면이나 시간대가 크게 전환될 때 AI가 자동으로 새 챕터로 구분합니다.</div>
      </div>

      <div className="side-section" hidden={tab !== 'ai'}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="label" style={{ marginBottom: 0 }}>✍️ 입력 다듬어 확장</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={conv.enrichInputMode ?? false}
              onChange={async e => {
                const checked = e.target.checked
                try {
                  await api.patch(`/api/conversations/${convId}`, { enrichInputMode: checked })
                  setConv(c => c ? { ...c, enrichInputMode: checked } : c)
                } catch { setToast('설정 저장에 실패했습니다') }
              }}
            />
            <span className="tiny">{conv.enrichInputMode ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>ON이면 내 입력을 다듬어 소설체로 확장한 뒤 AI가 자연스럽게 이어갑니다.</div>
      </div>

      <div className="side-section" hidden={tab !== 'ai'}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="label" style={{ marginBottom: 0 }}>🎭 페르소나 자율 대사</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(conv as any).personaAutoMode ?? false}
              onChange={async e => {
                const checked = e.target.checked
                try {
                  await api.patch(`/api/conversations/${convId}`, { personaAutoMode: checked })
                  setConv(c => c ? { ...c, personaAutoMode: checked } : c)
                } catch { setToast('설정 저장에 실패했습니다') }
              }}
            />
            <span className="tiny">{(conv as any).personaAutoMode ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>ON이면 AI가 페르소나의 대사와 행동도 함께 서술합니다. 소설처럼 양쪽 모두 AI가 씁니다.</div>
      </div>

      <div className="side-section" hidden={tab !== 'ai'}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="label" style={{ marginBottom: 0 }}>⏩ 빠른 전개</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(conv as any).fastPaceEnabled ?? false}
              onChange={async e => {
                const checked = e.target.checked
                try {
                  await api.patch(`/api/conversations/${convId}`, { fastPaceEnabled: checked })
                  setConv(c => c ? ({ ...c, fastPaceEnabled: checked } as any) : c)
                } catch { setToast('설정 저장에 실패했습니다') }
              }}
            />
            <span className="tiny">{(conv as any).fastPaceEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>ON이면 시간·장소를 과감히 건너뛰고 사건을 여러 단계 진행시켜 빠르게 전개합니다.</div>
      </div>

      <div className="side-section" hidden={tab !== 'ai'}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="label" style={{ marginBottom: 0 }}>🔞 성인 합의 게이팅</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(conv as any).adultGatingEnabled ?? true}
              onChange={async e => {
                const checked = e.target.checked
                try {
                  await api.patch(`/api/conversations/${convId}`, { adultGatingEnabled: checked })
                  setConv(c => c ? ({ ...c, adultGatingEnabled: checked } as any) : c)
                } catch { setToast('설정 저장에 실패했습니다') }
              }}
            />
            <span className="tiny">{((conv as any).adultGatingEnabled ?? true) ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>ON이면 성애 장면 진입에 합의·맥락 전제를 둡니다. OFF면 진입 게이팅을 해제합니다(모델 자체 안전선은 유지).</div>
      </div>

      <div className="side-section" hidden={tab !== 'memory'}>
        <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, bookmark: !o.bookmark }))}>
          <span>🔖 북마크</span>
          <span className={`acc-arrow ${panelOpen.bookmark ? 'open' : ''}`}>▼</span>
        </button>
        {panelOpen.bookmark && (
          <BookmarkPanel convId={convId} onJump={msgId => { onJumpToMessage(msgId); onClose() }} />
        )}
      </div>

      {(conv.mode === 'story' || conv.mode === 'multiStory') && (
        <div className="side-section" hidden={tab !== 'world'}>
          <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, plot: !o.plot }))}>
            <span>{conv.plotOutline?.source === 'tikita' ? '📖 에피소드' : '🗺 스토리 설계도'}{conv.plotOutline ? <span className="tiny muted" style={{ fontWeight: 400 }}> ({conv.chapter ?? 1}/{conv.plotOutline.totalChapters}{conv.plotOutline.source === 'tikita' ? '화' : '챕터'})</span> : null}</span>
            <span className={`acc-arrow ${panelOpen.plot ? 'open' : ''}`}>▼</span>
          </button>
          {panelOpen.plot && (
            <PlotPanel convId={convId} conv={conv} setConv={setConv} setToast={setToast} />
          )}
        </div>
      )}

      <div className="side-section" hidden={tab !== 'ai'}>
        <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, style: !o.style }))}>
          <span>🎨 스타일 설정</span>
          <span className={`acc-arrow ${panelOpen.style ? 'open' : ''}`}>▼</span>
        </button>
        {panelOpen.style && (
          <div className="vstack" style={{ gap: 6, marginTop: 6 }}>
            <div className="tiny muted" style={{ marginBottom: 2 }}>버튼을 다시 누르면 해제됩니다.</div>
            {([
              { key: 'pov',    label: '시점',     opts: ['1인칭', '3인칭'] },
              { key: 'tense',  label: '시제',     opts: ['현재형', '과거형'] },
              { key: 'mood',   label: '분위기',   opts: ['밝음', '중립', '어두움'] },
              { key: 'style',  label: '문체',     opts: ['문학적', '일상적', '극적'] },
              { key: 'pace',   label: '전개 속도', opts: ['빠름', '보통', '느림'] },
            ] as const).map(({ key, label, opts }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 600, width: 54, flexShrink: 0 }}>{label}</span>
                <div className="hstack" style={{ gap: 3, flexWrap: 'wrap' }}>
                  {opts.map(opt => (
                    <button
                      key={opt}
                      className={`btn ${conv?.styleConfig?.[key] === opt ? 'primary' : 'ghost'}`}
                      style={{ fontSize: 9, padding: '2px 7px' }}
                      onClick={() => handleStyleConfig(key, opt)}
                    >{opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 600, width: 54, flexShrink: 0 }}>응답 길이</span>
              <input type="number" min={0} placeholder="최소" style={{ width: 56, fontSize: 10 }}
                value={(conv?.styleConfig as any)?.length?.min ?? ''}
                onChange={e => setLength({ min: e.target.value ? Number(e.target.value) : undefined })} />
              <span className="muted">~</span>
              <input type="number" min={0} placeholder="최대" style={{ width: 56, fontSize: 10 }}
                value={(conv?.styleConfig as any)?.length?.max ?? ''}
                onChange={e => setLength({ max: e.target.value ? Number(e.target.value) : undefined })} />
              <span className="muted" style={{ fontSize: 10 }}>자</span>
            </div>
          </div>
        )}
      </div>

      <div className="side-section" hidden={tab !== 'ai'}>
        <div className="label">🎛 파라미터</div>
        <div className="vstack" style={{ gap: 11 }}>
          <div>
            <div className="tiny muted" style={{ marginBottom: 3 }}>🛡 안전 수준</div>
            <select className="field" style={{ fontSize: 11 }} value={conv.safetyLevel ?? 'standard'} onChange={e => handleSafety(e.target.value)}>
              <option value="strict">엄격 (Strict)</option>
              <option value="standard">표준 (Standard)</option>
              <option value="relaxed">완화 (Relaxed)</option>
            </select>
          </div>
          <div>
            <div className="spread"><span className="tiny muted">창의성 (temperature)</span><span className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>{(conv.temperature ?? 0.9).toFixed(1)}</span></div>
            <input type="range" className="param-slider" min={0} max={2} step={0.1} value={conv.temperature ?? 0.9} onChange={e => handleParam('temperature', parseFloat(e.target.value))} />
          </div>
          <div>
            <div className="spread"><span className="tiny muted">반복 억제</span><span className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>{(conv.frequencyPenalty ?? 0.3).toFixed(2)}</span></div>
            <input type="range" className="param-slider" min={0} max={2} step={0.05} value={conv.frequencyPenalty ?? 0.3} onChange={e => handleParam('frequencyPenalty', parseFloat(e.target.value))} />
          </div>
          <div>
            <div className="spread"><span className="tiny muted">응답 최대 길이</span><span className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>{((conv.maxOutputTokens ?? 8192) / 1024).toFixed(0)}K</span></div>
            <input type="range" className="param-slider" min={4096} max={32768} step={4096} value={conv.maxOutputTokens ?? 8192} onChange={e => handleParam('maxOutputTokens', parseInt(e.target.value))} />
          </div>
          <div>
            <div className="spread"><span className="tiny muted">깊이감 (사고 예산)</span><span className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>{(conv.thinkingBudget ?? 0) === 0 ? '끄기(빠름)' : `${((conv.thinkingBudget ?? 0) / 1024).toFixed(1)}K`}</span></div>
            <input type="range" className="param-slider" min={0} max={8192} step={512} value={conv.thinkingBudget ?? 0} onChange={e => handleParam('thinkingBudget', parseInt(e.target.value))} />
          </div>
          <div className="tiny muted" style={{ fontSize: 9, lineHeight: 1.5 }}>변경 즉시 이 대화에 저장됩니다. (Gemini Pro는 사고 예산 0이어도 동적으로 보정)</div>
        </div>
      </div>

      <div className="side-section" hidden={tab !== 'memory'}>
        <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, memory: !o.memory }))}>
          <span>📌 기억 · 상태</span>
          <span className={`acc-arrow ${panelOpen.memory ? 'open' : ''}`}>▼</span>
        </button>
        {panelOpen.memory && <>
          <div className="spread" style={{ marginBottom: 4, marginTop: 4 }}>
            <div className="hstack" style={{ gap: 4, alignItems: 'center' }}>
              <div className="label" style={{ marginBottom: 0 }}>핵심 메모리</div>
              <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => setInfoTip(t => t === 'core' ? null : 'core')}>?</button>
            </div>
            <div className="hstack" style={{ gap: 3 }}>
              <button
                className="btn ghost"
                style={{ fontSize: 9, padding: '1px 5px' }}
                onClick={async () => {
                  if (!conv.coreMemory.trim()) return
                  if (!confirm('AI로 핵심 메모리를 재압축합니다. 중복·만료된 내용이 제거됩니다. 계속할까요?')) return
                  setToast('핵심 메모리 압축 중...')
                  const result = await api.post(`/api/conversations/${convId}/core-memory`, {}).catch(() => null)
                  if (result?.coreMemory != null) {
                    setConv(c => c ? { ...c, coreMemory: result.coreMemory } : c)
                    setToast('핵심 메모리가 압축되었습니다')
                  } else {
                    setToast('압축에 실패했습니다')
                  }
                }}
              >✂ 정리</button>
              <button
                className="btn ghost"
                style={{ fontSize: 9, padding: '1px 5px' }}
                onClick={async () => {
                  const fresh = await api.get(`/api/conversations/${convId}`).catch(() => null)
                  if (fresh) setConv(c => c ? { ...c, coreMemory: fresh.coreMemory, statusTimeline: fresh.statusTimeline } : c)
                }}
              >↺</button>
            </div>
          </div>
          {infoTip === 'core' && (
            <div className="info-tip">대화 내내 AI가 절대 잊으면 안 되는 사실을 저장합니다.{'\n\n'}예: "유저의 이름은 하루. 쌍둥이 동생 미래가 있다. 마법을 쓸 수 없다."</div>
          )}
          <textarea
            className="field" rows={3}
            placeholder={"절대 잊으면 안 되는 설정을 적어두세요\n예: 유저는 마왕의 딸이다."}
            value={display(conv.coreMemory)}
            onChange={e => handleCoreMemory(e.target.value)}
          />
          <div className="label" style={{ marginTop: 8, marginBottom: 2 }}>타임라인 상태</div>
          <textarea
            className="field" rows={2}
            placeholder={"현재 에피소드 상태\n예: 마왕성 탐험 중 / 루나가 다리를 다침"}
            value={display(conv.statusTimeline)}
            onChange={e => handleStatusTimeline(e.target.value)}
          />
        </>}
      </div>

      <div className="side-section" hidden={tab !== 'world'}>
        <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, lorebook: !o.lorebook }))}>
          <span>📖 로어북 <span className="tiny muted" style={{ fontWeight: 400 }}>({lorebooks.length})</span></span>
          <span className={`acc-arrow ${panelOpen.lorebook ? 'open' : ''}`}>▼</span>
        </button>
        {panelOpen.lorebook && <>
          <div className="spread" style={{ marginBottom: 4, marginTop: 4 }}>
            <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => setInfoTip(t => t === 'lorebook' ? null : 'lorebook')}>?</button>
            <div className="hstack" style={{ gap: 3 }}>
              <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => { setShowLorebookImport(v => !v); setLorebookAdd(false) }}>📥 가져오기</button>
              {lorebooks.length < 20
                ? <button className="btn ghost" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => { setLorebookAdd(a => !a); setLorebookEditId(null); setShowLorebookImport(false) }}>+ 추가</button>
                : <span className="tiny muted" style={{ fontSize: 9 }}>최대 20개</span>
              }
            </div>
          </div>
          {conv.sourceLorebookUrls && conv.sourceLorebookUrls.length > 0 && (
            <div className="vstack" style={{ gap: 3, marginBottom: 6, padding: '5px 7px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
              <div className="tiny muted" style={{ fontSize: 9 }}>원본 로어북</div>
              {conv.sourceLorebookUrls.map((lb, i) => (
                <a key={i} href={lb.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ↗ {lb.name}
                </a>
              ))}
            </div>
          )}
          {showLorebookImport && (
            <div className="vstack" style={{ gap: 5, marginBottom: 8, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
              <div className="tiny muted" style={{ fontSize: 9, lineHeight: 1.5 }}>Zeta 로어북 페이지 전체 텍스트를 붙여넣으세요. AI가 자동으로 항목을 분리해 저장합니다.</div>
              <textarea
                className="field" rows={6} style={{ fontSize: 10, resize: 'none' }}
                placeholder="Zeta 로어북 페이지에서 Ctrl+A → Ctrl+C 후 여기에 붙여넣기"
                value={lorebookImportText}
                onChange={e => setLorebookImportText(e.target.value)}
              />
              <div className="hstack" style={{ gap: 4 }}>
                <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} disabled={lorebookImporting || !lorebookImportText.trim()} onClick={handleImportLorebook}>
                  {lorebookImporting ? '파싱 중...' : '✦ 저장'}
                </button>
                <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => { setShowLorebookImport(false); setLorebookImportText('') }}>취소</button>
              </div>
            </div>
          )}
        {infoTip === 'lorebook' && (
          <div className="info-tip">특정 키워드가 대화에 등장하면 관련 세계관 정보를 AI에게 자동 주입합니다. 최근 N턴(탐색깊이)만 스캔하며, 우선순위 높은 항목부터 최대 1,000 토큰까지 포함됩니다.{'\n\n'}예: 키워드 "마왕성" → "마왕성은 100년 전 악마왕이 건설한 요새로, 총 7개 층이다."</div>
        )}
        <div className="tiny muted" style={{ marginBottom: 6 }}>키워드 감지 시 자동으로 세계관 정보를 AI에게 주입합니다.</div>

        {lorebookAdd && (
          <div className="vstack" style={{ gap: 5, marginBottom: 8, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
            <input
              className="field" style={{ fontSize: 10 }} placeholder="키워드 (쉼표 구분)"
              value={lbForm.keywords} onChange={e => setLbForm(f => ({ ...f, keywords: e.target.value }))}
            />
            <textarea
              className="field" rows={2} style={{ fontSize: 10 }} placeholder="세계관 정보 내용"
              value={lbForm.content} onChange={e => setLbForm(f => ({ ...f, content: e.target.value }))}
            />
            <div className="hstack" style={{ gap: 4 }}>
              <label className="tiny muted">우선순위
                <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
                  value={lbForm.priority} onChange={e => setLbForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
              </label>
              <label className="tiny muted">탐색깊이
                <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
                  min={1} max={20} value={lbForm.scanDepth} onChange={e => setLbForm(f => ({ ...f, scanDepth: parseInt(e.target.value) || 5 }))} />
              </label>
              <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }} onClick={handleAddLorebook}>저장</button>
              <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => setLorebookAdd(false)}>취소</button>
            </div>
          </div>
        )}

        {lorebookError && (
          <div className="tiny" style={{ color: '#ff6b8a', marginBottom: 4 }}>⚠ 로어북 로드 실패</div>
        )}
        {lorebooks.length === 0 && !lorebookAdd && !lorebookError && (
          <div className="lorebook-placeholder"><span>로어북 항목이 없습니다</span></div>
        )}

        {lorebooks.map(lb => (
          <div key={lb.id} style={{ marginBottom: 6, padding: 6, background: 'var(--pane)', borderRadius: 'var(--radius)', border: '1px solid var(--chrome-border)' }}>
            {lorebookEditId === lb.id ? (
              <LorebookEditForm entry={lb} onSave={data => handlePatchLorebook(lb.id, data)} onCancel={() => setLorebookEditId(null)} />
            ) : (
              <>
                <div className="spread" style={{ marginBottom: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pink)' }}>{lb.keyword.join(', ')}</div>
                  <div className="hstack" style={{ gap: 3 }}>
                    <button className="msg-action-btn" style={{ fontSize: 9 }} onClick={() => { setLorebookEditId(lb.id); setLorebookAdd(false) }}>✏</button>
                    <button className="msg-action-btn danger" style={{ fontSize: 9 }} onClick={() => handleDeleteLorebook(lb.id)}>✕</button>
                  </div>
                </div>
                <div className="tiny muted" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 2 }}>{display(lb.content)}</div>
                <div className="tiny muted">우선순위 {lb.priority} · 탐색 {lb.scanDepth}턴</div>
              </>
            )}
          </div>
        ))}
        </>}
      </div>

      <div className="side-section" hidden={tab !== 'memory'}>
        <button className="acc-toggle" onClick={() => setPanelOpen(o => ({ ...o, longmem: !o.longmem }))}>
          <span>🧠 장기 메모리 <span className="tiny muted" style={{ fontWeight: 400 }}>({memories.length})</span></span>
          <span className={`acc-arrow ${panelOpen.longmem ? 'open' : ''}`}>▼</span>
        </button>
        {panelOpen.longmem && <>
          <div className="tiny muted" style={{ marginBottom: 6, marginTop: 4 }}>10턴마다 자동 요약 · 선택 후 핵심메모리로 올릴 수 있습니다.</div>
        {selectedMemoryIds.size > 0 && (
          <button
            className="btn primary"
            style={{ fontSize: 10, padding: '3px 8px', width: '100%', marginBottom: 6 }}
            disabled={promoting}
            onClick={handlePromoteMemories}
          >{promoting
            ? (selectedMemoryIds.size > 1 ? '요약해서 올리는 중...' : '올리는 중...')
            : `↑ 선택한 항목 핵심 메모리로 올리기 (${selectedMemoryIds.size})`}</button>
        )}
        {memoryError && (
          <div className="tiny" style={{ color: '#ff6b8a', marginBottom: 4 }}>⚠ 메모리 로드 실패</div>
        )}
        {memories.length === 0 && !memoryError ? (
          <div className="lorebook-placeholder"><span>아직 요약된 메모리가 없습니다</span></div>
        ) : (
          memories.map((mem, i) => {
            const checked = selectedMemoryIds.has(mem.id)
            const isPromoted = mem.promoted
            const isExpanded = expandedPromotedIds.has(mem.id)
            return (
              <div
                key={mem.id}
                style={{
                  marginBottom: 6, padding: 6, borderRadius: 'var(--radius)', cursor: 'pointer',
                  background: isPromoted ? 'color-mix(in srgb, var(--accent, #0095f6) 10%, var(--pane))' : checked ? 'var(--lavender)' : 'var(--pane)',
                  border: `1px solid ${isPromoted ? 'color-mix(in srgb, var(--accent, #0095f6) 40%, transparent)' : checked ? 'var(--pink)' : 'var(--chrome-border)'}`,
                  opacity: isPromoted && !isExpanded ? 0.65 : 1,
                }}
                onClick={isPromoted
                  ? (e) => { e.stopPropagation(); toggleExpandPromoted(mem.id) }
                  : () => toggleMemorySelect(mem.id)}
              >
                <div className="spread" style={{ marginBottom: isPromoted && !isExpanded ? 0 : 4 }}>
                  <div className="hstack" style={{ gap: 5 }}>
                    {isPromoted
                      ? <span style={{ fontSize: 9, color: 'var(--accent, #0095f6)', fontWeight: 700 }}>↑ 핵심</span>
                      : <input type="checkbox" checked={checked} onChange={() => {}} style={{ cursor: 'pointer' }} />
                    }
                    <div style={{ fontSize: 9, color: 'var(--ink-soft)' }}>요약 #{i + 1}</div>
                  </div>
                  <div className="hstack" style={{ gap: 4 }}>
                    {isPromoted && (
                      <span style={{ fontSize: 9, color: 'var(--ink-soft)' }}>{isExpanded ? '▲' : '▼'}</span>
                    )}
                    {isPromoted && (
                      <button
                        className="msg-action-btn"
                        style={{ fontSize: 9 }}
                        title="핵심 메모리에서 내려 다시 선택 가능하게 합니다"
                        onClick={e => { e.stopPropagation(); handleUnpromoteMemory(mem.id) }}
                      >↩ 해제</button>
                    )}
                    <button
                      className="msg-action-btn danger"
                      style={{ fontSize: 9 }}
                      onClick={e => { e.stopPropagation(); handleDeleteMemory(mem.id) }}
                    >✕</button>
                  </div>
                </div>
                {(!isPromoted || isExpanded) && (
                  <div className="tiny muted" style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{mem.summary}</div>
                )}
              </div>
            )
          })
        )}
        </>}
      </div>
    </div>
    </>
  )
}

function BookmarkPanel({ convId, onJump }: {
  convId: string
  onJump: (msgId: string) => void
}) {
  const [bookmarks, setBookmarks] = useState<{ id: string; role: string; content: string; createdAt: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/conversations/${convId}/bookmarks`)
      .then(setBookmarks)
      .catch(() => setBookmarks([]))
      .finally(() => setLoading(false))
  }, [convId])

  if (loading) return <div className="tiny muted" style={{ padding: '6px 0' }}>불러오는 중...</div>
  if (bookmarks.length === 0) {
    return <div className="tiny muted" style={{ padding: '6px 0', lineHeight: 1.5 }}>북마크한 메시지가 없습니다.<br />메시지를 탭하고 🔖 버튼으로 명장면을 저장하세요.</div>
  }

  return (
    <div className="vstack" style={{ gap: 4, marginTop: 6 }}>
      {bookmarks.map(b => (
        <div
          key={b.id}
          style={{ padding: 6, background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
          onClick={() => onJump(b.id)}
        >
          <div className="spread" style={{ marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: b.role === 'user' ? 'var(--accent, #0095f6)' : 'var(--hot-pink)' }}>
              {b.role === 'user' ? '나' : 'AI'}
            </span>
            <span className="tiny muted" style={{ fontSize: 9 }}>
              {new Date(b.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="tiny muted" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', lineHeight: 1.5 }}>
            {b.content}
          </div>
        </div>
      ))}
    </div>
  )
}

function PlotPanel({ convId, conv, setConv, setToast }: {
  convId: string
  conv: Conv
  setConv: React.Dispatch<React.SetStateAction<Conv | null>>
  setToast: (msg: string) => void
}) {
  const [chapterCount, setChapterCount] = useState<number | ''>(conv.plotOutline?.totalChapters ?? 6)
  const [generating, setGenerating] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const outline = conv.plotOutline

  const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'
  const charNames = conv.characters.map(cc => cc.character.name)
  const display = (text: string) => replaceDisplayPlaceholders(text, personaName, charNames)

  const resolvedChapters = Math.min(30, Math.max(2, typeof chapterCount === 'number' ? chapterCount : 6))
  const isTikita = outline?.source === 'tikita'

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const result = await api.post(`/api/conversations/${convId}/plot`, { totalChapters: resolvedChapters })
      setConv(c => c ? { ...c, plotOutline: result } : c)
      setToast('스토리 설계도가 생성되었습니다')
    } catch (e: any) {
      setToast(e.message ?? '설계도 생성에 실패했습니다')
    } finally {
      setGenerating(false)
    }
  }

  const handleMode = async (mode: 'auto' | 'choice') => {
    if (!outline || outline.mode === mode) return
    try {
      const result = await api.patch(`/api/conversations/${convId}/plot`, { mode })
      setConv(c => c ? { ...c, plotOutline: result } : c)
    } catch { setToast('전개 방식 변경에 실패했습니다') }
  }

  const handleDelete = async () => {
    const msg = isTikita
      ? '에피소드 추적을 해제할까요? AI가 더 이상 원작 에피소드 흐름을 따라가지 않습니다.'
      : '스토리 설계도를 삭제할까요? AI가 더 이상 플롯을 따라가지 않습니다.'
    if (!confirm(msg)) return
    try {
      await api.delete(`/api/conversations/${convId}/plot`)
      setConv(c => c ? { ...c, plotOutline: null } : c)
      setShowOutline(false)
    } catch { setToast('삭제에 실패했습니다') }
  }

  return (
    <div className="vstack" style={{ gap: 6, marginTop: 6 }}>
      <div className="tiny muted" style={{ lineHeight: 1.5 }}>
        {isTikita
          ? '원작이 설계한 에피소드 흐름을 따라 스토리를 진행합니다. 내용은 기본적으로 숨겨집니다.'
          : 'AI가 결말까지의 챕터별 플롯을 설계하고, 그 흐름대로 스토리를 능동적으로 이끌어갑니다. 설계 내용은 기본적으로 숨겨집니다.'}
      </div>

      {!outline ? (
        <div className="hstack" style={{ gap: 6, alignItems: 'center' }}>
          <label className="tiny muted">총 챕터
            <input
              type="number" className="field"
              style={{ marginLeft: 4, width: 48, fontSize: 10, display: 'inline-block' }}
              min={2} max={30} value={chapterCount}
              onChange={e => setChapterCount(e.target.value === '' ? '' : parseInt(e.target.value))}
              onBlur={() => setChapterCount(resolvedChapters)}
            />
          </label>
          <button className="btn primary" style={{ fontSize: 10, padding: '3px 8px' }} disabled={generating} onClick={handleGenerate}>
            {generating ? '설계 중...' : '✦ 설계도 생성'}
          </button>
        </div>
      ) : (
        <>
          <div className="hstack" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600 }}>전개 방식</span>
            <button className={`btn ${outline.mode === 'auto' ? 'primary' : 'ghost'}`} style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => handleMode('auto')}>AI 자동</button>
            <button className={`btn ${outline.mode === 'choice' ? 'primary' : 'ghost'}`} style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => handleMode('choice')}>선택지 제시</button>
          </div>
          <div className="tiny muted">
            {outline.mode === 'auto'
              ? 'AI가 설계도를 따라 알아서 사건을 일으키며 진행합니다.'
              : '챕터가 끝날 때 다음 전개 방향을 선택지로 제시합니다.'}
          </div>

          <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
            <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={() => setShowOutline(v => !v)}>
              {showOutline
                ? (isTikita ? '▲ 에피소드 숨기기' : '▲ 설계도 숨기기')
                : (isTikita ? '▼ 에피소드 보기' : '▼ 설계도 보기 (스포일러)')}
            </button>
            {!isTikita && (
              <label className="tiny muted" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="number" className="field"
                  style={{ width: 40, fontSize: 9, display: 'inline-block', padding: '1px 4px' }}
                  min={2} max={30} value={chapterCount}
                  onChange={e => setChapterCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                  onBlur={() => setChapterCount(resolvedChapters)}
                />챕터
              </label>
            )}
            {!isTikita && (
              <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} disabled={generating} onClick={handleGenerate}>
                {generating ? '재설계 중...' : '↺ 재설계'}
              </button>
            )}
            <button className="btn danger" style={{ fontSize: 9, padding: '2px 7px' }} onClick={handleDelete}>
              {isTikita ? '✕ 추적 해제' : '✕ 삭제'}
            </button>
          </div>

          {showOutline && (
            <div className="vstack" style={{ gap: 4 }}>
              {outline.chapters.map(ch => {
                const isCurrent = ch.index === (conv.chapter ?? 1)
                return (
                  <div key={ch.index} style={{
                    padding: 6, borderRadius: 'var(--radius)',
                    background: isCurrent
                      ? 'color-mix(in srgb, var(--accent) 28%, var(--chrome-face))'
                      : 'color-mix(in srgb, var(--ink) 8%, var(--chrome-face))',
                    border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--chrome-border)'}`,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink)' }}>
                      {isCurrent ? '▶ ' : ''}{ch.index}{isTikita ? '화' : '챕터'} 「{display(ch.title)}」
                    </div>
                    <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.5 }}>{display(ch.goal)}</div>
                    {ch.events.length > 0 && (
                      <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.5 }}>
                        {ch.events.map((ev, i) => <div key={i}>• {display(ev)}</div>)}
                      </div>
                    )}
                  </div>
                )
              })}
              {outline.ending && (
                <div className="tiny muted" style={{ padding: '4px 6px', lineHeight: 1.5 }}>🏁 결말 방향: {display(outline.ending)}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LorebookEditForm({ entry, onSave, onCancel }: { entry: LbEntry; onSave: (data: Partial<LbEntry>) => void; onCancel: () => void }) {
  const [keywords, setKeywords] = useState(entry.keyword.join(', '))
  const [content, setContent] = useState(entry.content)
  const [priority, setPriority] = useState(entry.priority)
  const [scanDepth, setScanDepth] = useState(entry.scanDepth)
  return (
    <div className="vstack" style={{ gap: 5 }}>
      <input className="field" style={{ fontSize: 10 }} placeholder="키워드 (쉼표 구분)" value={keywords} onChange={e => setKeywords(e.target.value)} />
      <textarea className="field" rows={2} style={{ fontSize: 10 }} value={content} onChange={e => setContent(e.target.value)} />
      <div className="hstack" style={{ gap: 4 }}>
        <label className="tiny muted">우선순위
          <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
            value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)} />
        </label>
        <label className="tiny muted">탐색깊이
          <input type="number" className="field" style={{ marginLeft: 4, width: 44, fontSize: 10, display: 'inline-block' }}
            min={1} max={20} value={scanDepth} onChange={e => setScanDepth(parseInt(e.target.value) || 5)} />
        </label>
        <button className="btn primary" style={{ fontSize: 9, padding: '2px 7px' }}
          onClick={() => onSave({ keyword: keywords.split(',').map(k => k.trim()).filter(Boolean), content, priority, scanDepth })}>저장</button>
        <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
