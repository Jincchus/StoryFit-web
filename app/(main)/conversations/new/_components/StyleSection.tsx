'use client'

export default function StyleSection({ styleConfig, onToggle, onLengthChange }: {
  styleConfig: Record<string, any>
  onToggle: (key: string, val: string) => void
  onLengthChange: (length: { min?: number; max?: number }) => void
}) {
  const len = (styleConfig.length ?? {}) as { min?: number; max?: number }
  return (
    <section className="new-conv-section">
      <div className="label">스타일 설정 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
      <div className="tiny muted" style={{ marginBottom: 8 }}>AI가 어떻게 쓸지를 조절합니다. 선택하지 않으면 AI가 자유롭게 판단합니다.</div>
      {([
        { key: 'pov',    label: '시점',     opts: ['1인칭', '3인칭'] },
        { key: 'tense',  label: '시제',     opts: ['현재형', '과거형'] },
        { key: 'mood',   label: '분위기',   opts: ['밝음', '중립', '어두움'] },
        { key: 'style',  label: '문체',     opts: ['문학적', '일상적', '극적'] },
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
                onClick={() => onToggle(key, opt)}
              >{opt}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="hstack" style={{ gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, width: 60, flexShrink: 0 }}>응답 길이</span>
        <input
          type="number" min={0} placeholder="최소" style={{ width: 70, fontSize: 11 }}
          value={len.min ?? ''}
          onChange={e => onLengthChange({ ...len, min: e.target.value ? Number(e.target.value) : undefined })}
        />
        <span className="muted">~</span>
        <input
          type="number" min={0} placeholder="최대" style={{ width: 70, fontSize: 11 }}
          value={len.max ?? ''}
          onChange={e => onLengthChange({ ...len, max: e.target.value ? Number(e.target.value) : undefined })}
        />
        <span className="muted" style={{ fontSize: 11 }}>자</span>
      </div>
    </section>
  )
}
