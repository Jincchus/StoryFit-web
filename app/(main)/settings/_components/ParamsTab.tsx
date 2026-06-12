'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import ParamTooltip from '@/components/ui/ParamTooltip'

export default function ParamsTab() {
  const [temperature, setTemperature] = useState(0.9)
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.3)
  const [maxOutputTokens, setMaxOutputTokens] = useState(8192)
  const [thinkingBudget, setThinkingBudget] = useState(0)
  const [safetyLevel, setSafetyLevel] = useState('standard')
  const [defaultAI, setDefaultAI] = useState('gemini')
  const [paramSaved, setParamSaved] = useState(false)
  const [paramLoading, setParamLoading] = useState(false)
  const [ttsRate, setTtsRateState] = useState(1.0)

  useEffect(() => {
    api.get('/api/user/settings').then((data: any) => {
      setTemperature(data.defaultTemperature ?? 0.9)
      setFrequencyPenalty(data.defaultFrequencyPenalty ?? 0.3)
      setMaxOutputTokens(data.defaultMaxOutputTokens ?? 8192)
      setThinkingBudget(data.defaultThinkingBudget ?? 0)
      setSafetyLevel(data.defaultSafetyLevel ?? 'standard')
      setDefaultAI(data.defaultAI ?? 'gemini')
    }).catch(() => {})
    setTtsRateState(parseFloat(localStorage.getItem('sf_tts_rate') ?? '1.0'))
  }, [])

  const saveParams = async () => {
    setParamLoading(true); setParamSaved(false)
    try {
      await api.patch('/api/user/settings', { defaultTemperature: temperature, defaultFrequencyPenalty: frequencyPenalty, defaultMaxOutputTokens: maxOutputTokens, defaultThinkingBudget: thinkingBudget, defaultSafetyLevel: safetyLevel, defaultAI })
      setParamSaved(true); setTimeout(() => setParamSaved(false), 2000)
    } finally { setParamLoading(false) }
  }

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div style={{ padding: '8px 10px', background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)', fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
        새 대화를 시작할 때 이 값이 기본으로 적용됩니다. 캐릭터를 선택하면 캐릭터 설정값으로 덮어씌워집니다.
      </div>
      <div>
        <label className="label">기본 AI 모델</label>
        <select className="field" value={defaultAI} onChange={e => setDefaultAI(e.target.value)}>
          <option value="gemini">Gemini</option>
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

      <div style={{ fontSize: 12, fontWeight: 700, borderTop: '1px solid var(--chrome-border)', paddingTop: 12, marginTop: 4 }}>로컬 설정 <span className="tiny muted" style={{ fontWeight: 400 }}>(이 기기에만 적용)</span></div>
      <div>
        <label className="label">TTS 읽기 속도: {ttsRate.toFixed(1)}x</label>
        <input type="range" className="param-slider" min={0.5} max={2.0} step={0.1}
          value={ttsRate}
          onChange={e => {
            const v = parseFloat(e.target.value)
            setTtsRateState(v)
            localStorage.setItem('sf_tts_rate', String(v))
          }}
        />
        <div className="spread" style={{ marginTop: 2 }}>
          <span className="tiny muted">느림 (0.5x)</span>
          <span className="tiny muted">빠름 (2.0x)</span>
        </div>
      </div>
    </div>
  )
}
