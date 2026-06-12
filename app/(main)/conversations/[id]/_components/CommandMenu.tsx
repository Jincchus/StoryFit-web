'use client'

export default function CommandMenu({ commands, selectedIndex, onSelect, onHover, onClose }: {
  commands: { name: string; desc: string }[]
  selectedIndex: number
  onSelect: (name: string) => void
  onHover: (index: number) => void
  onClose: () => void
}) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 19 }}
        onClick={onClose}
      />
      {commands.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 20,
          marginBottom: 6,
          background: 'rgba(15, 10, 20, 0.93)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1.5px solid rgba(255, 46, 147, 0.4)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(255, 46, 147, 0.15)',
          overflow: 'hidden',
          padding: '4px 0'
        }}>
          <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#ff2e93', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            💡 시스템 명령어 자동완성 (이동: ↑↓, 선택: Enter)
          </div>
          <div className="vstack" style={{ gap: 0, maxHeight: 200, overflowY: 'auto' }}>
            {commands.map((cmd, idx) => {
              const isActive = idx === selectedIndex
              return (
                <div
                  key={cmd.name}
                  onClick={() => onSelect(cmd.name)}
                  onMouseEnter={() => onHover(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(255, 46, 147, 0.2)' : 'transparent',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
                    {cmd.name}
                  </span>
                  <span style={{ fontSize: 11, color: isActive ? '#eee' : 'var(--muted)' }}>
                    {cmd.desc}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
