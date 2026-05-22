'use client'
import { useState, useEffect } from 'react'
import PixelAvatar, { PixelIcons } from '@/components/ui/PixelAvatar'

function Clock() {
  const fmt = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const [time, setTime] = useState('')
  useEffect(() => {
    setTime(fmt())
    const id = setInterval(() => setTime(fmt()), 30000)
    return () => clearInterval(id)
  }, [])
  return <>{time}</>
}

const DESKTOP_ICONS = [
  { label: 'StoryFit', node: <PixelAvatar kind="ai" size={38} /> },
  { label: '내 문서', node: <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center' }}>{PixelIcons.user}</div> },
  { label: '채팅', node: <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center' }}>{PixelIcons.chat}</div> },
  { label: '설정', node: <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center' }}>{PixelIcons.settings}</div> },
]

function DesktopIcons() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 80, flexShrink: 0, padding: '10px 0 10px 4px', alignItems: 'center' }}>
      {DESKTOP_ICONS.map(({ label, node }) => (
        <div key={label} className="di">
          <div className="di-pic">{node}</div>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

const MOCK_CONVS = [
  {
    id: 'c1', name: '메이', kind: 'maid' as const,
    title: '메이와의 대화', when: '방금 전',
    last: '*메이는 찻잔을 조심스럽게 내려놓으며* "차 식기 전에 드세요."',
    tag: 'gemini',
  },
  {
    id: 'c2', name: '오리온', kind: 'ai' as const,
    title: '오리온과의 대화', when: '2시간 전',
    last: '[경고] 외부 도킹 시도 감지.',
    tag: 'gemini',
  },
  {
    id: 'c3', name: '루나', kind: 'wizard' as const,
    title: '루나와의 대화', when: '어제',
    last: '"별이 이상한 방향으로 흐르고 있어요. 무언가 오고 있어요."',
    tag: 'claude',
  },
]

function HomeScreen() {
  return (
    <div className="win" style={{ flex: 1 }}>
      <div className="win-title">
        <div className="win-title-l">
          {PixelIcons.home}
          <span>홈 (Home)</span>
        </div>
        <div className="win-controls">
          <button>_</button><button>▢</button><button>×</button>
        </div>
      </div>
      <div className="win-body vstack" style={{ gap: 10 }}>
        <div className="spread">
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>최근 대화</div>
            <div className="tiny muted">이어서 플레이하세요</div>
          </div>
          <button className="btn primary" style={{ fontSize: 11 }}>+ 새 대화</button>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          {MOCK_CONVS.map(c => (
            <div key={c.id} className="row" style={{ marginBottom: 8 }}>
              <div className="thumb">
                <PixelAvatar kind={c.kind} size={36} />
              </div>
              <div className="meta">
                <h4>{c.title}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 10, marginLeft: 6 }}>· {c.when}</span>
                </h4>
                <p>{c.last}</p>
              </div>
              <span style={{ fontSize: 9, padding: '1px 4px', background: 'var(--mint)', border: '1px solid var(--chrome-border)', color: 'var(--ink-soft)', flexShrink: 0 }}>
                {c.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DesignPreviewPage() {
  return (
    <div className="shell-wrap">
      <div className="shell">
        <div className="shell-title">
          <div className="hstack" style={{ gap: 6 }}>
            <svg viewBox="0 0 16 16" width="14" height="14" shapeRendering="crispEdges">
              <rect x="2" y="2" width="12" height="12" fill="#ff8fcf" />
              <rect x="3" y="3" width="10" height="10" fill="#ffe07a" />
              <rect x="6" y="5" width="1" height="1" fill="#1a1438" />
              <rect x="9" y="5" width="1" height="1" fill="#1a1438" />
              <rect x="6" y="8" width="4" height="1" fill="#1a1438" />
            </svg>
            <span>StoryFit — 디자인 미리보기</span>
          </div>
          <div className="win-controls">
            <button>_</button><button>▢</button><button>×</button>
          </div>
        </div>

        <div className="shell-body" style={{ flexDirection: 'row', gap: 12 }}>
          <DesktopIcons />
        </div>

        <div className="dock">
          <button className="start">
            <svg viewBox="0 0 16 16" width="12" height="12" shapeRendering="crispEdges">
              <rect x="2" y="2" width="5" height="5" fill="#ffe07a" />
              <rect x="9" y="2" width="5" height="5" fill="#fff" />
              <rect x="2" y="9" width="5" height="5" fill="#a3e0ff" />
              <rect x="9" y="9" width="5" height="5" fill="#b8f5d2" />
            </svg>
            시작
          </button>
          <div style={{ display: 'flex', gap: 4, overflow: 'hidden', flex: 1 }}>
            <button className="dock-tab active">홈</button>
            <button className="dock-tab">페르소나</button>
          </div>
          <div className="tray" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 6px', fontSize: 14 }}>
            <span title="네트워크" style={{ color: '#22a06b' }}>●</span>
          </div>
          <div className="clock"><Clock /></div>
        </div>
      </div>
    </div>
  )
}
