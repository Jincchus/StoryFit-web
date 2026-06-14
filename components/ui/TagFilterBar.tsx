'use client'

export interface TagGroup { category: string; tags: string[] }

export default function TagFilterBar({ groups, selected, onToggle, onClear, chipClass, accentVar }: {
  groups: TagGroup[]
  selected: string[]
  onToggle: (tag: string) => void
  onClear: () => void
  chipClass: string
  accentVar: string
}) {
  if (groups.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 8px', maxHeight: 220, overflowY: 'auto' }}>
      {selected.length > 0 && (
        <div>
          <button className={chipClass} style={{ cursor: 'pointer', border: 'none' }} onClick={onClear}>✕ 전체 해제</button>
        </div>
      )}
      {groups.map(g => (
        <div key={g.category} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>{g.category}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {g.tags.map(tag => {
              const active = selected.includes(tag)
              return (
                <button
                  key={tag}
                  className={chipClass}
                  style={{ cursor: 'pointer', border: 'none', background: active ? `var(${accentVar})` : undefined, color: active ? '#fff' : undefined }}
                  onClick={() => onToggle(tag)}
                >#{tag}</button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
