'use client'
import PixelAvatar from '@/components/ui/PixelAvatar'
import type { VoiceCallStatus } from '../_hooks/useVoiceCall'

export default function VoiceCallOverlay({ char, status, userText, charText, onEnd }: {
  char: { name: string; kind: string; avatarUrl?: string }
  status: VoiceCallStatus
  userText: string
  charText: string
  onEnd: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(10, 8, 16, 0.94)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="win" style={{
        width: 'min(360px, 92vw)',
        background: 'rgba(25, 20, 35, 0.85)',
        border: '1.5px solid #ff2e93',
        boxShadow: '0 0 30px rgba(255, 46, 147, 0.35), inset 0 0 15px rgba(255, 46, 147, 0.1)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        <style>{`
          @keyframes neon-pulse {
            0% {
              transform: scale(1);
              box-shadow: 0 0 0 0 rgba(255, 46, 147, 0.6), 0 0 0 0 rgba(0, 255, 204, 0.3);
            }
            70% {
              transform: scale(1.04);
              box-shadow: 0 0 0 15px rgba(255, 46, 147, 0), 0 0 0 20px rgba(0, 255, 204, 0);
            }
            100% {
              transform: scale(1);
              box-shadow: 0 0 0 0 rgba(255, 46, 147, 0), 0 0 0 0 rgba(0, 255, 204, 0);
            }
          }
          .pulse-avatar {
            animation: neon-pulse 2s infinite ease-in-out;
            border: 3px solid #ff2e93;
          }
        `}</style>

        <div className="win-title" style={{
          background: '#ff2e93',
          color: '#fff',
          borderBottom: 'none',
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 14px',
          fontWeight: 700,
        }}>
          📞 Live Voice Call
        </div>

        <div className="win-body vstack" style={{
          alignItems: 'center',
          gap: 20,
          padding: '24px 20px',
          background: 'transparent',
        }}>
          <div style={{ position: 'relative', margin: '10px 0' }}>
            <div className="pulse-avatar" style={{
              width: 100, height: 100,
              borderRadius: '50%',
              overflow: 'hidden',
              background: 'var(--lavender)',
              display: 'grid',
              placeItems: 'center',
            }}>
              {char.avatarUrl ? (
                <img src={char.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              ) : (
                <PixelAvatar kind={char.kind as any} size={80} />
              )}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {char.name}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              color: status === 'speaking' ? '#ff2e93'
                : status === 'listening' ? '#00ffcc'
                : status === 'thinking' ? '#ffd700'
                : '#aaa',
              textTransform: 'uppercase',
            }}>
              {status === 'connecting' && '연결 중...'}
              {status === 'speaking' && '🔊 통화 중...'}
              {status === 'listening' && '🎤 당신의 말을 듣는 중...'}
              {status === 'thinking' && '⚡ 생각 중...'}
            </div>
          </div>

          <div className="vstack" style={{
            width: '100%',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '12px 14px',
            minHeight: 120,
            maxHeight: 180,
            overflowY: 'auto',
            gap: 10,
          }}>
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: '#ff2e93', marginRight: 6 }}>{char.name}:</span>
              <span style={{ color: '#eee', fontStyle: 'italic' }}>
                {charText ? `"${charText}"` : '...'}
              </span>
            </div>

            <div style={{ fontSize: 12, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: '#00ffcc', marginRight: 6 }}>당신:</span>
              <span style={{ color: '#eee' }}>
                {userText ? `"${userText}"` : '말씀하세요...'}
              </span>
            </div>
          </div>

          <button
            onClick={onEnd}
            style={{
              width: 50, height: 50,
              borderRadius: '50%',
              background: '#ed4956',
              border: 'none',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 4px 15px rgba(237, 73, 86, 0.4)',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            aria-label="통화 종료"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  )
}
