'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PixelAvatar from '@/components/ui/PixelAvatar'
import Win from '@/components/ui/Win'
import { apiLogin } from '@/lib/authClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setError('')
    setPending(false)
    setLoading(true)
    try {
      await apiLogin(email, password)
      router.push('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '로그인 실패'
      if (msg === 'PENDING_APPROVAL') { setPending(true) } else { setError(msg) }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shell-wrap">
      <div className="shell">
        <div className="shell-title">
          <div className="hstack" style={{ gap: 6 }}>
            <svg viewBox="0 0 16 16" width="14" height="14" shapeRendering="crispEdges">
              <rect x="2" y="2" width="12" height="12" fill="#ff8fcf"/>
              <rect x="3" y="3" width="10" height="10" fill="#ffe07a"/>
              <rect x="6" y="5" width="1" height="1" fill="#1a1438"/>
              <rect x="9" y="5" width="1" height="1" fill="#1a1438"/>
              <rect x="6" y="8" width="4" height="1" fill="#1a1438"/>
            </svg>
            <span>StoryFit — 로그인</span>
          </div>
          <div className="win-controls">
            <button>_</button><button>▢</button><button>×</button>
          </div>
        </div>

        <div className="shell-body" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Win title="로그인 (Login)" className="login-card">
            <div className="login-screen" style={{ paddingTop: 0 }}>
              <div className="login-brand">
                <PixelAvatar kind="ai" size={48} />
                <div>
                  <div className="login-title">StoryFit</div>
                  <div className="tiny muted login-sub">소설형 롤플레이 AI 채팅</div>
                </div>
              </div>

              <form className="vstack" style={{ gap: 10, width: '100%' }} onSubmit={handleSubmit}>
                <div>
                  <label className="label">이메일</label>
                  <input
                    className="field"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="label">비밀번호</label>
                  <input
                    className="field"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                {pending && (
                  <div style={{ background: 'var(--lemon)', border: '1px solid var(--chrome-border)', borderRadius: 4, padding: '8px 12px' }}>
                    <div className="tiny" style={{ color: '#7a6200', lineHeight: 1.6 }}>
                      ✦ 관리자 승인 대기 중입니다.<br />승인 완료 후 로그인하실 수 있습니다.
                    </div>
                  </div>
                )}
                {error && <div className="tiny" style={{ color: '#ff6b8a' }}>{error}</div>}
                <button
                  className="btn primary"
                  type="submit"
                  disabled={loading || !email.trim() || !password.trim()}
                  style={{ marginTop: 4 }}
                >
                  {loading ? '로그인 중...' : '✦ 로그인'}
                </button>
              </form>

              <div className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>
                계정이 없으신가요?{' '}
                <Link href="/register" style={{ color: '#ff8fcf', textDecoration: 'none' }}>
                  회원가입
                </Link>
              </div>
            </div>
          </Win>
        </div>
      </div>
    </div>
  )
}
