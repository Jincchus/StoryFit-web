'use client'
interface Props {
  characters: { id: string; name: string; avatarUrl: string | null }[]
  onPick: (aiCharIds: string[]) => void
  onClose: () => void
}
export default function ChatModeModal({ characters, onPick, onClose }: Props) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--pane)', borderRadius: 'var(--radius-lg)', padding: 16, width: 'min(360px, 90vw)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>누구와 대화할까요?</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
        </div>
        <button onClick={() => onPick(characters.map(c => c.id))}
          style={{ appearance: 'none', border: '1px solid var(--hairline)', background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius)', padding: '10px', cursor: 'pointer', fontWeight: 700 }}>
          전체와 대화 (멀티)
        </button>
        {characters.map(c => (
          <button key={c.id} onClick={() => onPick([c.id])}
            style={{ appearance: 'none', border: '1px solid var(--hairline)', background: 'var(--bg-2)', color: 'var(--ink)', borderRadius: 'var(--radius)', padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {c.avatarUrl ? <img src={c.avatarUrl} loading="lazy" decoding="async" alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--hairline)' }} />}
            {c.name}와 1:1
          </button>
        ))}
      </div>
    </div>
  )
}
