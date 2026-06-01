'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import ParamTooltip from '@/components/ui/ParamTooltip'
import { THEMES, applyTheme } from '@/lib/theme'

type Tab = 'profile' | 'params' | 'security' | 'stats' | 'export' | 'theme'

interface Stats {
  conversationCount: number
  messageCount: number
  totalInputTokens: number
  totalOutputTokens: number
  byModel: { model: string; count: number; inputTokens: number; outputTokens: number }[]
}

interface ConvSummary {
  id: string
  title: string
  updatedAt: string
  mode: string
  characters: { character: { name: string } }[]
}

const MODEL_LABELS: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', chatgpt: 'ChatGPT' }

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')

  // profile
  const [displayName, setDisplayName] = useState('')
  const [personalRules, setPersonalRules] = useState('')
  const [personalRulesNovel, setPersonalRulesNovel] = useState('')
  const [personalRulesStory, setPersonalRulesStory] = useState('')
  const [adminGlobalRules, setAdminGlobalRules] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)

  // params
  const [temperature, setTemperature] = useState(0.9)
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.3)
  const [maxOutputTokens, setMaxOutputTokens] = useState(8192)
  const [thinkingBudget, setThinkingBudget] = useState(0)
  const [safetyLevel, setSafetyLevel] = useState('standard')
  const [defaultAI, setDefaultAI] = useState('gemini')
  const [paramSaved, setParamSaved] = useState(false)
  const [paramLoading, setParamLoading] = useState(false)

  // theme
  const [currentTheme, setCurrentTheme] = useState('retro')
  const [themeSaved, setThemeSaved] = useState(false)

  // security
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  // stats
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // export
  const [convList, setConvList] = useState<ConvSummary[]>([])
  const [exportLoading, setExportLoading] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/user/settings').then((data: any) => {
      setDisplayName(data.displayName ?? '')
      setPersonalRules(data.personalRules ?? '')
      setPersonalRulesNovel(data.personalRulesNovel ?? '')
      setPersonalRulesStory(data.personalRulesStory ?? '')
      setAdminGlobalRules(data.adminGlobalRules ?? '')
      setTemperature(data.defaultTemperature ?? 0.9)
      setFrequencyPenalty(data.defaultFrequencyPenalty ?? 0.3)
      setMaxOutputTokens(data.defaultMaxOutputTokens ?? 8192)
      setThinkingBudget(data.defaultThinkingBudget ?? 0)
      setSafetyLevel(data.defaultSafetyLevel ?? 'standard')
      setDefaultAI(data.defaultAI ?? 'gemini')
      setCurrentTheme(data.theme ?? 'retro')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'stats' && !stats) {
      setStatsLoading(true)
      api.get('/api/user/stats').then((d: any) => setStats(d)).catch(() => {}).finally(() => setStatsLoading(false))
    }
    if (tab === 'export' && convList.length === 0) {
      api.get('/api/conversations').then((d: any) => setConvList(d ?? [])).catch(() => {})
    }
  }, [tab])

  const saveProfile = async () => {
    setProfileLoading(true); setProfileSaved(false)
    try {
      await api.patch('/api/user/settings', { displayName, personalRules, personalRulesNovel, personalRulesStory })
      setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2000)
    } finally { setProfileLoading(false) }
  }

  const saveParams = async () => {
    setParamLoading(true); setParamSaved(false)
    try {
      await api.patch('/api/user/settings', { defaultTemperature: temperature, defaultFrequencyPenalty: frequencyPenalty, defaultMaxOutputTokens: maxOutputTokens, defaultThinkingBudget: thinkingBudget, defaultSafetyLevel: safetyLevel, defaultAI })
      setParamSaved(true); setTimeout(() => setParamSaved(false), 2000)
    } finally { setParamLoading(false) }
  }

  const changePw = async () => {
    setPwError(''); setPwSaved(false)
    if (newPw.length < 8) { setPwError('새 비밀번호는 8자 이상이어야 합니다.'); return }
    if (newPw !== confirmPw) { setPwError('새 비밀번호가 일치하지 않습니다.'); return }
    setPwLoading(true)
    try {
      await api.patch('/api/user/password', { currentPassword: currentPw, newPassword: newPw })
      setPwSaved(true); setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => setPwSaved(false), 2000)
    } catch (e: any) {
      setPwError(e.message ?? '오류가 발생했습니다.')
    } finally { setPwLoading(false) }
  }

  const downloadExport = async (id?: string) => {
    const key = id ?? 'all'
    setExportLoading(key)
    try {
      const url = id ? `/api/user/export?id=${id}` : '/api/user/export'
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="(.+)"/)?.[1] ?? 'storyfit-export.json'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } finally { setExportLoading(null) }
  }

  const selectTheme = async (id: string) => {
    setCurrentTheme(id)
    applyTheme(id)
    setThemeSaved(false)
    try {
      await api.patch('/api/user/settings', { theme: id })
      setThemeSaved(true)
      setTimeout(() => setThemeSaved(false), 2000)
    } catch {}
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'profile', label: '프로필·프롬프트' },
    { id: 'params', label: '파라미터' },
    { id: 'theme', label: '테마' },
    { id: 'security', label: '보안' },
    { id: 'stats', label: '통계' },
    { id: 'export', label: '내보내기' },
  ]

  return (
    <Win title="설정" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 0, flex: 1, minHeight: 0 }}>
        {/* 탭 바 */}
        <div className="hstack" style={{ gap: 2, padding: '4px 4px 0', borderBottom: '1px solid var(--chrome-border)', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`btn ${tab === t.id ? 'primary' : 'ghost'}`}
              style={{ fontSize: 10, padding: '3px 10px', borderRadius: '3px 3px 0 0', minHeight: 24 }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 12 }}>

          {/* ── 프로필·프롬프트 ── */}
          {tab === 'profile' && (
            <div className="vstack" style={{ gap: 16 }}>
              <div className="vstack" style={{ gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>프로필</div>
                <div>
                  <label className="label">표시 이름 <span className="tiny muted">(관리자 페이지 유저 목록에 표시)</span></label>
                  <input className="field" placeholder="닉네임 (비워두면 이메일 앞부분 사용)" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                </div>
              </div>
              <div className="vstack" style={{ gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>AI 프롬프트 개인 설정</div>
                {adminGlobalRules.trim() && (
                  <div>
                    <div className="label">관리자 공통 규칙 <span className="tiny muted">(읽기 전용)</span></div>
                    <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.05)', border: '1px solid var(--chrome-border)', fontSize: 10, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontFamily: 'var(--font-mono)' }}>{adminGlobalRules}</div>
                  </div>
                )}
                <div>
                  <label className="label">⚔ 롤플레이 모드 <span className="tiny muted">(롤플레이 대화에만 삽입)</span></label>
                  <textarea className="field" rows={4} placeholder={"예: 응답은 항상 반말로 해주세요."} value={personalRules} onChange={e => setPersonalRules(e.target.value)} />
                </div>
                <div>
                  <label className="label">✍ 소설 모드 <span className="tiny muted">(소설 대화에만 삽입)</span></label>
                  <textarea className="field" rows={4} placeholder={"예: 장면 묘사를 풍부하게 작성해주세요."} value={personalRulesNovel} onChange={e => setPersonalRulesNovel(e.target.value)} />
                </div>
                <div>
                  <label className="label">📖 스토리 모드 <span className="tiny muted">(스토리 대화에만 삽입)</span></label>
                  <textarea className="field" rows={4} placeholder={"예: 선택지는 항상 한국어로 작성해주세요."} value={personalRulesStory} onChange={e => setPersonalRulesStory(e.target.value)} />
                </div>
              </div>
              <div className="hstack" style={{ gap: 6 }}>
                <button className="btn primary" disabled={profileLoading} onClick={saveProfile}>{profileLoading ? '저장 중...' : '✦ 저장'}</button>
                {profileSaved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨</span>}
              </div>
            </div>
          )}

          {/* ── 파라미터 기본값 ── */}
          {tab === 'params' && (
            <div className="vstack" style={{ gap: 16 }}>
              <div style={{ padding: '8px 10px', background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)', fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                새 대화를 시작할 때 이 값이 기본으로 적용됩니다. 캐릭터를 선택하면 캐릭터 설정값으로 덮어씌워집니다.
              </div>
              <div>
                <label className="label">기본 AI 모델</label>
                <select className="field" value={defaultAI} onChange={e => setDefaultAI(e.target.value)}>
                  <option value="gemini">Gemini</option>
                  {/* <option value="chatgpt">ChatGPT</option> */}
                  {/* <option value="claude">Claude</option> */}
                </select>
              </div>
              <div>
                <label className="label">
                  안전 수준
                  <ParamTooltip text={"엄격: 민감 표현 강하게 차단\n표준: 일반적 수준 (기본값)\n완화: 성숙한 표현 일부 허용"} />
                </label>
                <select className="field" value={safetyLevel} onChange={e => setSafetyLevel(e.target.value)}>
                  <option value="strict">엄격 (Strict)</option>
                  <option value="standard">표준 (Standard)</option>
                  <option value="relaxed">완화 (Relaxed)</option>
                </select>
              </div>
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
              <div className="hstack" style={{ gap: 6 }}>
                <button className="btn primary" disabled={paramLoading} onClick={saveParams}>{paramLoading ? '저장 중...' : '✦ 저장'}</button>
                {paramSaved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨</span>}
              </div>
            </div>
          )}

          {/* ── 테마 ── */}
          {tab === 'theme' && (
            <div className="vstack" style={{ gap: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>앱 테마</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTheme(t.id)}
                    style={{
                      appearance: 'none', cursor: 'pointer', textAlign: 'left',
                      padding: 0, background: 'none', border: 'none',
                    }}
                  >
                    <div style={{
                      border: currentTheme === t.id ? '2px solid var(--hot-pink)' : '1.5px solid var(--chrome-border)',
                      borderRadius: 'var(--radius)',
                      padding: 8,
                      background: currentTheme === t.id ? 'var(--paper-2)' : 'var(--paper)',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      outline: currentTheme === t.id ? '1px dashed var(--hot-pink)' : 'none',
                      outlineOffset: 2,
                    }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {t.palette.map((c, i) => (
                          <div key={i} style={{ flex: 1, height: 24, background: c, border: '1px solid rgba(0,0,0,0.15)' }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{t.label}</div>
                      <div className="tiny muted" style={{ lineHeight: 1.4 }}>{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              {themeSaved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨</span>}
            </div>
          )}

          {/* ── 보안 ── */}
          {tab === 'security' && (
            <div className="vstack" style={{ gap: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>비밀번호 변경</div>
              <div className="vstack" style={{ gap: 8 }}>
                <div>
                  <label className="label">현재 비밀번호</label>
                  <input className="field" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                </div>
                <div>
                  <label className="label">새 비밀번호 <span className="tiny muted">(8자 이상)</span></label>
                  <input className="field" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
                </div>
                <div>
                  <label className="label">새 비밀번호 확인</label>
                  <input className="field" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') changePw() }} />
                </div>
                {pwError && <div className="tiny" style={{ color: 'var(--danger)' }}>{pwError}</div>}
              </div>
              <div className="hstack" style={{ gap: 6 }}>
                <button className="btn primary" disabled={pwLoading || !currentPw || !newPw || !confirmPw} onClick={changePw}>{pwLoading ? '변경 중...' : '비밀번호 변경'}</button>
                {pwSaved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 변경됨</span>}
              </div>
            </div>
          )}

          {/* ── 통계 ── */}
          {tab === 'stats' && (
            <div className="vstack" style={{ gap: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>사용 통계</div>
              {statsLoading && <div className="tiny muted">로딩 중...</div>}
              {stats && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                    {[
                      { label: '총 대화', value: stats.conversationCount.toLocaleString() },
                      { label: '총 메시지', value: stats.messageCount.toLocaleString() },
                      { label: '입력 토큰', value: fmt(stats.totalInputTokens) },
                      { label: '출력 토큰', value: fmt(stats.totalOutputTokens) },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ padding: '10px 12px', border: '1px solid var(--chrome-border)', background: 'var(--pane)' }}>
                        <div className="tiny muted" style={{ marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {stats.byModel.length > 0 && (
                    <div className="vstack" style={{ gap: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>AI 모델별 사용량</div>
                      {stats.byModel.map(m => (
                        <div key={m.model} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 6, alignItems: 'center', padding: '6px 10px', border: '1px solid var(--chrome-border)' }}>
                          <div style={{ fontWeight: 700, fontSize: 11 }}>{MODEL_LABELS[m.model] ?? m.model}</div>
                          <div className="tiny muted">응답 {m.count.toLocaleString()}개</div>
                          <div className="tiny muted">입력 {fmt(m.inputTokens)}</div>
                          <div className="tiny muted">출력 {fmt(m.outputTokens)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── 내보내기 ── */}
          {tab === 'export' && (
            <div className="vstack" style={{ gap: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>대화 내보내기</div>
              <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--chrome-border)', fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                JSON 형식으로 다운로드합니다. 대화 내용과 메시지 전체가 포함됩니다.
              </div>
              <button
                className="btn primary"
                style={{ alignSelf: 'flex-start' }}
                disabled={exportLoading === 'all'}
                onClick={() => downloadExport()}
              >
                {exportLoading === 'all' ? '내보내는 중...' : '전체 대화 내보내기'}
              </button>
              {convList.length > 0 && (
                <div className="vstack" style={{ gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>개별 내보내기</div>
                  {convList.map((c: ConvSummary) => (
                    <div key={c.id} className="spread" style={{ padding: '6px 10px', border: '1px solid var(--chrome-border)', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                        <div className="tiny muted">
                          {c.characters?.[0]?.character?.name ?? '—'} · {c.mode} · {new Date(c.updatedAt).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      <button
                        className="btn ghost"
                        style={{ fontSize: 10, flexShrink: 0 }}
                        disabled={exportLoading === c.id}
                        onClick={() => downloadExport(c.id)}
                      >
                        {exportLoading === c.id ? '...' : '↓ 저장'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </Win>
  )
}
