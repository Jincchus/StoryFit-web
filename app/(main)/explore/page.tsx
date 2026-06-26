'use client'
import { useRouter } from 'next/navigation'
import { CENTERS as CENTER_DEFS } from '@/lib/centers'

// 센터 목록은 lib/centers.ts 단일 소스에서 파생.
const CENTERS = CENTER_DEFS.map(c => ({
  href: c.path, emoji: c.emoji, name: `${c.label} 센터`, desc: c.desc, grad: c.grad,
}))

const SHORTCUTS = [
  { href: '/characters', emoji: '🎭', name: '내 캐릭터', desc: '컬렉션 관리 · 직접 만들기' },
  { href: '/personas', emoji: '🪞', name: '페르소나', desc: '내가 연기할 역할 관리' },
]

export default function ExplorePage() {
  const router = useRouter()

  return (
    <div className="scroll" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="vstack" style={{ gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>외부 센터</div>
        <button
          onClick={() => router.push('/explore/all')}
          style={{
            appearance: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)', color: '#fff',
          }}
        >
          <span style={{ fontSize: 26 }}>🗂</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>전체 보기</span>
            <span style={{ display: 'block', fontSize: 12, opacity: .85, marginTop: 2 }}>모든 센터 카드를 한 번에 탐색</span>
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 16, opacity: .8 }}>›</span>
        </button>
        {CENTERS.map(c => (
          <button
            key={c.href}
            onClick={() => router.push(c.href)}
            style={{
              appearance: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 'var(--radius-lg)',
              background: c.grad, color: '#fff',
            }}
          >
            <span style={{ fontSize: 26 }}>{c.emoji}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>{c.name}</span>
              <span style={{ display: 'block', fontSize: 12, opacity: .85, marginTop: 2 }}>{c.desc}</span>
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 16, opacity: .8 }}>›</span>
          </button>
        ))}
      </div>

      <div className="vstack" style={{ gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>내 콘텐츠</div>
        {SHORTCUTS.map(s => (
          <button
            key={s.href}
            onClick={() => router.push(s.href)}
            style={{
              appearance: 'none', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 'var(--radius-lg)',
              background: 'var(--pane)', border: '1px solid var(--hairline)', color: 'var(--ink)',
            }}
          >
            <span style={{ fontSize: 22 }}>{s.emoji}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{s.name}</span>
              <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{s.desc}</span>
            </span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
