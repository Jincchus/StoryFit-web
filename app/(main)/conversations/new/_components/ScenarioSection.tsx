'use client'
import { useState } from 'react'

export default function ScenarioSection({ value, onChange, onGenerate, loading, canGenerate }: {
  value: string
  onChange: (v: string) => void
  onGenerate: (hint: string) => void
  loading: boolean
  canGenerate: boolean
}) {
  const [showHint, setShowHint] = useState(false)
  const [hint, setHint] = useState('')

  return (
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
            disabled={!canGenerate || loading}
            onClick={() => onGenerate(hint)}
          >
            {loading ? '생성 중...' : '✦ AI 생성'}
          </button>
        </div>
      </div>
      {showHint && (
        <input
          className="field"
          style={{ marginBottom: 6, fontSize: 11 }}
          placeholder="생성 힌트 (선택): 마법학원, 재회, 비오는 밤..."
          value={hint}
          onChange={e => setHint(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onGenerate(hint) } }}
        />
      )}
      <textarea
        className="field" rows={3}
        placeholder={"이 대화의 세계관·배경을 설정하세요\n예: 마법 학원 천문대, 루나는 오늘 밤 예언을 완성해야 한다."}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </section>
  )
}
