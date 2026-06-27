'use client'
import { useEffect, useState } from 'react'

export interface TagGroup { category: string; tags: string[] }

export default function TagFilterBar({ groups, selected, onToggle, onClear, chipClass, accentVar, counts, storageKey }: {
  groups: TagGroup[]
  selected: string[]
  onToggle: (tag: string) => void
  onClear: () => void
  chipClass: string
  accentVar: string
  counts?: Record<string, number>
  storageKey?: string
}) {
  // 기본 접힘. storageKey 있으면 마운트 후 localStorage에서 복원(hydration mismatch 방지).
  const [collapsed, setCollapsed] = useState(true)
  useEffect(() => {
    if (!storageKey) return
    const v = localStorage.getItem(storageKey)
    if (v !== null) setCollapsed(v === '1')
  }, [storageKey])

  const toggle = () => setCollapsed(c => {
    const next = !c
    if (storageKey) localStorage.setItem(storageKey, next ? '1' : '0')
    return next
  })

  if (groups.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 8px' }}>
      <div>
        <button className={chipClass} style={{ cursor: 'pointer', border: 'none' }} onClick={toggle}>
          🏷 태그{selected.length > 0 ? ` (${selected.length})` : ''} {collapsed ? '▾' : '▴'}
        </button>
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
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
                    >#{tag}{counts?.[tag] ? <span style={{ marginLeft: 4, opacity: active ? 0.8 : 0.5 }}>{counts[tag]}</span> : null}</button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
