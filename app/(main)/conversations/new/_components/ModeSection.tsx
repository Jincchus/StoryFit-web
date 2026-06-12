'use client'

export default function ModeSection({
  mode, setMode, statsEnabled, setStatsEnabled, statTagPool, selectedStats, setSelectedStats,
  inventoryEnabled, setInventoryEnabled, autoChapterEnabled, setAutoChapterEnabled,
  plotEnabled, setPlotEnabled, plotChapters, setPlotChapters,
}: {
  mode: 'story' | 'multiStory'
  setMode: (m: 'story' | 'multiStory') => void
  statsEnabled: boolean
  setStatsEnabled: (v: boolean) => void
  statTagPool: string[]
  selectedStats: string[]
  setSelectedStats: React.Dispatch<React.SetStateAction<string[]>>
  inventoryEnabled: boolean
  setInventoryEnabled: (v: boolean) => void
  autoChapterEnabled: boolean
  setAutoChapterEnabled: (v: boolean) => void
  plotEnabled: boolean
  setPlotEnabled: (v: boolean) => void
  plotChapters: number
  setPlotChapters: (v: number) => void
}) {
  return (
    <section className="new-conv-section">
      <div className="label">대화 모드</div>
      <div className="hstack" style={{ gap: 8 }}>
        <button className={`btn ${mode === 'story' ? 'primary' : 'ghost'}`} onClick={() => setMode('story')} style={{ fontSize: 11 }}>📖 스토리</button>
        <button className={`btn ${mode === 'multiStory' ? 'primary' : 'ghost'}`} onClick={() => setMode('multiStory')} style={{ fontSize: 11 }}>👥 멀티스토리</button>
      </div>
      <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
        {mode === 'story' && '선택지 기반 인터랙티브 스토리 — AI가 장면을 쓰고 선택지를 제시합니다'}
        {mode === 'multiStory' && '다인 캐릭터 스토리 — 여러 캐릭터가 자연스럽게 상호작용하며 선택지를 제시합니다'}
      </div>
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
      <div className="vstack" style={{ gap: 6, marginTop: 6, padding: '8px 10px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="tiny" style={{ fontWeight: 700 }}>🔖 AI 자동 챕터 구분</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoChapterEnabled}
              onChange={e => setAutoChapterEnabled(e.target.checked)}
            />
            <span className="tiny">{autoChapterEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        {autoChapterEnabled && (
          <div className="tiny muted">장면이나 시간대가 크게 전환될 때 AI가 자동으로 새 챕터로 구분합니다.</div>
        )}
      </div>
      <div className="vstack" style={{ gap: 6, marginTop: 6, padding: '8px 10px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="tiny" style={{ fontWeight: 700 }}>🗺 스토리 설계도 (플롯 자동 설계)</div>
          <label className="hstack" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={plotEnabled}
              onChange={e => setPlotEnabled(e.target.checked)}
            />
            <span className="tiny">{plotEnabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        {plotEnabled && (
          <>
            <div className="tiny muted">AI가 결말까지의 챕터별 플롯을 미리 설계하고, 그 흐름대로 중간 사건을 일으키며 스토리를 이끌어갑니다. 설계 내용은 숨겨지며 대화방 설정에서 확인할 수 있습니다.</div>
            <label className="tiny muted">총 챕터 수
              <input
                type="number" className="field"
                style={{ marginLeft: 6, width: 52, fontSize: 10, display: 'inline-block' }}
                min={2} max={30} value={plotChapters}
                onChange={e => setPlotChapters(parseInt(e.target.value) || 6)}
              />
            </label>
          </>
        )}
      </div>
    </section>
  )
}
