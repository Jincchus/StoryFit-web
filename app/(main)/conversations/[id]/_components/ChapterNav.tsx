'use client'
import { chapterLabel, type ChapterAnchor } from '@/lib/chapters'

export default function ChapterNav({
  chapterMeta, currentChapter, plotOutline, onJump,
}: {
  chapterMeta: ChapterAnchor[]
  currentChapter: number
  plotOutline?: { chapters: { index: number; title: string }[] } | null
  onJump: (firstMessageId: string) => void
}) {
  if (chapterMeta.length < 2) return null
  const idx = Math.max(0, chapterMeta.findIndex(c => c.chapter === currentChapter))
  const go = (i: number) => {
    const t = chapterMeta[i]
    if (t) onJump(t.firstMessageId)
  }
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 8, padding: '6px 10px',
      background: 'var(--bg-elev, #1d1f25)', borderBottom: '1px solid var(--border, #2a2c33)',
      fontSize: 12, color: 'var(--text, #cfd2db)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn ghost" style={{ padding: '1px 8px' }} disabled={idx <= 0} onClick={() => go(idx - 1)}>◀</button>
        <select
          value={currentChapter}
          onChange={e => { const ch = Number(e.target.value); const i = chapterMeta.findIndex(c => c.chapter === ch); go(i) }}
          style={{ background: 'transparent', color: 'inherit', border: 'none', fontSize: 12, maxWidth: 200 }}
        >
          {chapterMeta.map(c => (
            <option key={c.chapter} value={c.chapter}>{chapterLabel(c.chapter, plotOutline)}</option>
          ))}
        </select>
        <button className="btn ghost" style={{ padding: '1px 8px' }} disabled={idx >= chapterMeta.length - 1} onClick={() => go(idx + 1)}>▶</button>
      </div>
      <span style={{ fontSize: 10, color: 'var(--muted, #7b8090)' }}>{idx + 1}/{chapterMeta.length}</span>
    </div>
  )
}
