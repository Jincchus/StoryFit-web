'use client'

export default function TagFilterBar({ tags, selected, onToggle, onClear, chipClass, accentVar }: {
  tags: string[]
  selected: string[]
  onToggle: (tag: string) => void
  onClear: () => void
  chipClass: string
  accentVar: string
}) {
  if (tags.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 8px', maxHeight: 96, overflowY: 'auto' }}>
      {selected.length > 0 && (
        <button
          className={chipClass}
          style={{ cursor: 'pointer', border: 'none' }}
          onClick={onClear}
        >✕ 전체</button>
      )}
      {tags.map(tag => {
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
  )
}
