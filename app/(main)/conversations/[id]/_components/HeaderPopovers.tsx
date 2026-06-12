'use client'

function renderBold(line: string): React.ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ color: 'var(--hot-pink)' }}>{p.slice(2, -2)}</strong>
      : p
  )
}

export function RecapPopover({ recap, loading, onRegenerate, onClose }: {
  recap: string
  loading: boolean
  onRegenerate: () => void
  onClose: () => void
}) {
  return (
    <>
    <div style={{ position: 'fixed', inset: 0, zIndex: 9, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
    <div style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10,
      background: 'var(--chrome-face)', border: '1.5px solid var(--chrome-border)',
      borderRadius: 'var(--radius)', padding: '14px 16px', width: 'min(480px, 92vw)', maxHeight: '75dvh',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    }}>
      <div className="spread" style={{ marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>📜 지금까지의 줄거리</div>
        <div className="hstack" style={{ gap: 4 }}>
          <button className="btn ghost" style={{ fontSize: 9, padding: '2px 7px' }} disabled={loading} onClick={onRegenerate}>
            {loading ? '...' : '↺ 다시 생성'}
          </button>
          <button className="btn ghost" style={{ fontSize: 11, padding: '1px 6px' }} onClick={onClose}>×</button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div className="vstack" style={{ gap: 8 }}>
            <div className="skeleton skeleton-line medium" />
            <div className="skeleton skeleton-line" style={{ width: '95%' }} />
            <div className="skeleton skeleton-line" style={{ width: '88%' }} />
            <div className="skeleton skeleton-line short" />
          </div>
        ) : (
          <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {recap.split('\n').map((line, i) => (
              <div key={i}>{renderBold(line)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

export function StatsPopover({ statsConfig, onClose }: {
  statsConfig: { name: string; value: number; min: number; max: number }[]
  onClose: () => void
}) {
  return (
    <>
    <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={onClose} />
    <div style={{
      position: 'fixed', top: 56, right: 12, zIndex: 10,
      background: 'var(--chrome-face)', border: '1.5px solid var(--chrome-border)',
      borderRadius: 'var(--radius)', padding: '12px 14px', minWidth: 'min(200px, 90vw)', maxWidth: 'min(260px, 90vw)',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 10 }}>📊 스탯</div>
      <div className="vstack" style={{ gap: 8 }}>
        {statsConfig.map(stat => {
          const pct = Math.round(((stat.value - stat.min) / (stat.max - stat.min)) * 100)
          const color = pct >= 70 ? 'var(--pink)' : pct >= 40 ? 'var(--lavender)' : 'var(--ink-soft)'
          return (
            <div key={stat.name}>
              <div className="spread" style={{ marginBottom: 3 }}>
                <span className="tiny" style={{ fontWeight: 700 }}>{stat.name}</span>
                <span className="tiny muted">{stat.value} / {stat.max}</span>
              </div>
              <div style={{ height: 6, background: 'var(--chrome-border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </>
  )
}

export function InventoryPopover({ inventory, onDelete, onClose }: {
  inventory: { name: string; qty: number; description?: string }[] | null
  onDelete: (index: number) => void
  onClose: () => void
}) {
  return (
    <>
    <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={onClose} />
    <div style={{
      position: 'fixed', top: 56, right: 12, zIndex: 10,
      background: 'var(--chrome-face)', border: '1.5px solid var(--chrome-border)',
      borderRadius: 'var(--radius)', padding: '12px 14px', minWidth: 'min(200px, 90vw)', maxWidth: 'min(280px, 90vw)',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 10 }}>🎒 인벤토리</div>
      {(!inventory || inventory.length === 0) ? (
        <div className="tiny muted">보유 아이템이 없습니다.</div>
      ) : (
        <div className="vstack" style={{ gap: 6 }}>
          {inventory.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--chrome-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="hstack" style={{ gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{item.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--pink)', fontWeight: 700 }}>×{item.qty}</span>
                </div>
                {item.description && (
                  <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
                )}
              </div>
              <button
                className="btn ghost"
                style={{ padding: '1px 5px', fontSize: 11, color: 'var(--ink-muted)', flexShrink: 0 }}
                onClick={() => onDelete(i)}
                title="삭제"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  )
}
