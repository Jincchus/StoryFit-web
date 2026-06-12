'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import PixelAvatar from '@/components/ui/PixelAvatar'
import { applyTheme, THEMES } from '@/lib/theme'
import type { Character } from '@/types'
import { useLorebook } from '../_hooks/useLorebook'
import { useMemoryPanel } from '../_hooks/useMemoryPanel'
import type { Conv, ConvChar, LbEntry, BranchInfo } from '../_lib/chatShared'

export default function SidePanel({
  convId, conv, setConv, allChars, branches, customBg, setCustomBg, currentTheme, setCurrentTheme,
  debouncedPatch, setToast, onShowCharCard, onClose,
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
  debouncedPatch: (field: string, value: string) => void
  setToast: (msg: string) => void
  onShowCharCard: (c: ConvChar['character']) => void
  onClose: () => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [panelOpen, setPanelOpen] = useState<Record<string, boolean>>({ memory: true, lorebook: false, branch: false, style: false, persona: false })
  const [infoTip, setInfoTip] = useState<string | null>(null)

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
    handleDeleteMemory, handlePromoteMemories,
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
    api.patch(`/api/conversations/${convId}`, { styleConfig: next }).catch(() => {})
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
      <div className="side-panel-header spread">
        <span style={{ fontWeight: 700, fontSize: 11 }}>대화 설정</span>
        <button className="btn ghost" style={{ padding: '1px 5px', fontSize: 11 }} aria-label="닫기" onClick={onClose}>×</button>
      </div>

      {branches.length > 1 && (
        <div className="side-section">
          <div className="label">분기 설명 <span className="tiny muted">(현재 버전: v{branches.find(b => b.id === convId)?.version ?? 1})</span></div>
          <input
            className="field"
            style={{ fontSize: 11 }}
            placeholder="예: 루나가 거절하는 방향"
            value={conv.branchDescription ?? ''}
            onChange={e => handleBranchDescription(e.target.value)}
            maxLength={100}
          />
        </div>
      )}

      <div className="side-section">
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

      {/* 화면 테마 및 배경 설정 */}
      <div className="side-section">
        <div className="label">화면 테마 설정</div>
        <select
          className="field"
          style={{ fontSize: 11 }}
          value={currentTheme}
          onChange={async e => {
            const val = e.target.value
            setCurrentTheme(val)
            applyTheme(val)
            await api.patch('/api/user/settings', { theme: val }).catch(() => {})
          }}
        >
          {THEMES.map(t => (
            <option key={t.id} value={t.id}>{t.label} ({t.desc})</option>
          ))}
        </select>
      </div>

      <div className="side-section">
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

      <div className="side-section">
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

      <div className="side-section">
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

      <div className="side-section">
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
          value={conv.scenarioDescription}
          onChange={e => handleScenarioDescription(e.target.value)}
        />
      </div>

      <div className="side-section">
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="label" style={{ marginBottom: 0 }}>🔖 AI 자동 챕터 구분</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={conv.autoChapterEnabled ?? false}
              onChange={async e => {
                const checked = e.target.checked
                setConv(c => c ? { ...c, autoChapterEnabled: checked } : c)
                await api.patch(`/api/conversations/${convId}`, { autoChapterEnabled: checked }).catch(() => {})
              }}
            />
            <span className="tiny">{conv.autoChapterEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>장면이나 시간대가 크게 전환될 때 AI가 자동으로 새 챕터로 구분합니다.</div>
      </div>

      <div className="side-section">
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
              { key: 'length', label: '응답 길이', opts: ['짧게', '보통', '길게'] },
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
          </div>
        )}
      </div>

      <div className="side-section">
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
            <button
              className="btn ghost"
              style={{ fontSize: 9, padding: '1px 5px' }}
              onClick={async () => {
                const fresh = await api.get(`/api/conversations/${convId}`).catch(() => null)
                if (fresh) setConv(c => c ? { ...c, coreMemory: fresh.coreMemory, statusTimeline: fresh.statusTimeline } : c)
              }}
            >↺</button>
          </div>
          {infoTip === 'core' && (
            <div className="info-tip">대화 내내 AI가 절대 잊으면 안 되는 사실을 저장합니다.{'\n\n'}예: "유저의 이름은 하루. 쌍둥이 동생 미래가 있다. 마법을 쓸 수 없다."</div>
          )}
          <textarea
            className="field" rows={3}
            placeholder={"절대 잊으면 안 되는 설정을 적어두세요\n예: 유저는 마왕의 딸이다."}
            value={conv.coreMemory}
            onChange={e => handleCoreMemory(e.target.value)}
          />
          <div className="label" style={{ marginTop: 8, marginBottom: 2 }}>타임라인 상태</div>
          <textarea
            className="field" rows={2}
            placeholder={"현재 에피소드 상태\n예: 마왕성 탐험 중 / 루나가 다리를 다침"}
            value={conv.statusTimeline}
            onChange={e => handleStatusTimeline(e.target.value)}
          />
        </>}
      </div>

      <div className="side-section">
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
                <div className="tiny muted" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 2 }}>{lb.content}</div>
                <div className="tiny muted">우선순위 {lb.priority} · 탐색 {lb.scanDepth}턴</div>
              </>
            )}
          </div>
        ))}
        </>}
      </div>

      <div className="side-section">
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
