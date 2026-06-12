'use client'
import { useState } from 'react'
import ParamTooltip from '@/components/ui/ParamTooltip'

export default function AdvancedParamsSection({
  safetyLevel, setSafetyLevel, temperature, setTemperature,
  frequencyPenalty, setFrequencyPenalty, maxOutputTokens, setMaxOutputTokens,
  thinkingBudget, setThinkingBudget,
}: {
  safetyLevel: 'strict' | 'standard' | 'relaxed'
  setSafetyLevel: (v: 'strict' | 'standard' | 'relaxed') => void
  temperature: number
  setTemperature: (v: number) => void
  frequencyPenalty: number
  setFrequencyPenalty: (v: number) => void
  maxOutputTokens: number
  setMaxOutputTokens: (v: number) => void
  thinkingBudget: number
  setThinkingBudget: (v: number) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <>
      <section className="new-conv-section" style={{ padding: '6px 0', borderTop: '1px solid var(--chrome-border)' }}>
        <button
          className="btn ghost"
          style={{ fontSize: 11, width: '100%', textAlign: 'left' }}
          onClick={() => setShowAdvanced(v => !v)}
        >
          {showAdvanced ? '▲' : '▼'} 고급 설정 (AI 파라미터)
        </button>
      </section>

      {showAdvanced && (
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
      )}
    </>
  )
}
