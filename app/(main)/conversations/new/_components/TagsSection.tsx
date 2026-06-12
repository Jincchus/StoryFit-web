'use client'
import { useState } from 'react'

export default function TagsSection({ tags, setTags, tagPool }: {
  tags: string[]
  setTags: React.Dispatch<React.SetStateAction<string[]>>
  tagPool: string[]
}) {
  const [tagInput, setTagInput] = useState('')

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  return (
    <section className="new-conv-section">
      <div className="label">세계관 태그 <span className="muted" style={{ fontWeight: 400 }}>(선택사항)</span></div>
      <div className="tag-scroll" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div className="tag-row" style={{ flexWrap: 'nowrap', gap: 5, width: 'max-content' }}>
          {[...tagPool].sort((a, b) => a.localeCompare(b, 'ko')).map(tag => (
            <span
              key={tag}
              className={`tag ${tags.includes(tag) ? 'tag-selected' : ''}`}
              style={{ cursor: 'pointer', padding: '2px 7px', fontSize: 10, whiteSpace: 'nowrap' }}
              onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
            >
              {tags.includes(tag) ? '✓ ' : ''}{tag}
            </span>
          ))}
        </div>
      </div>
      <div className="hstack" style={{ gap: 6 }}>
        <input
          className="field" style={{ flex: 1 }} placeholder="직접 입력..."
          value={tagInput} onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
        />
        <button className="btn" onClick={addTag}>추가</button>
      </div>
      {tags.length > 0 && (
        <div className="tag-row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 4 }}>
          {tags.map(t => (
            <span key={t} className="tag tag-selected" style={{ cursor: 'pointer' }}
              onClick={() => setTags(prev => prev.filter(x => x !== t))}>
              {t} ×
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
