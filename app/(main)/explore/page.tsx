'use client'
import { useRouter } from 'next/navigation'

const CENTERS = [
  {
    href: '/whif', emoji: '🪐', name: 'WHIF 센터',
    desc: '세계관 단위로 캐릭터를 탐색하고 가져오기',
    grad: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  },
  {
    href: '/zeta', emoji: '⚡', name: 'ZETA 센터',
    desc: '플롯 중심의 인터랙티브 스토리 가져오기',
    grad: 'linear-gradient(135deg, #7c5cff, #9d6bff)',
  },
  {
    href: '/melting', emoji: '🔥', name: 'MELTING 센터',
    desc: '캐릭터 중심의 몰입형 대화 가져오기',
    grad: 'linear-gradient(135deg, #ff2e93, #ff5fae)',
  },
  {
    href: '/tikita', emoji: '🎫', name: 'TIKITA 센터',
    desc: '스토리 URL로 캐릭터·첫 장면 가져오기',
    grad: 'linear-gradient(135deg, #16b8a6, #27d3bf)',
  },
  {
    href: '/chub', emoji: '🧩', name: 'CHUB 센터',
    desc: '외국 캐릭터 URL을 AI 번역으로 가져오기',
    grad: 'linear-gradient(135deg, #ff6a3d, #ff9a5a)',
  },
  {
    href: '/rofan', emoji: '💗', name: 'rofanai 센터',
    desc: '로맨스 판타지 캐릭터 URL로 가져오기',
    grad: 'linear-gradient(135deg, #e0529c, #f07ab8)',
  },
  {
    href: '/loveydovey', emoji: '💞', name: 'loveydovey 센터',
    desc: '캐릭터 메타데이터 가져오기',
    grad: 'linear-gradient(135deg, #ff5a5f, #ff8a8d)',
  },
]

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
