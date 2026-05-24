'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PixelAvatar from '@/components/ui/PixelAvatar'
import Win from '@/components/ui/Win'
import { apiRegister } from '@/lib/authClient'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)

  const passwordMismatch = confirm.length > 0 && confirm !== password
  const isValid = email.trim() && password.length >= 8 && confirm === password

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || loading) return
    setError('')
    setLoading(true)
    try {
      const result = await apiRegister(email, password)
      if (result.pending) { setPending(true); return }
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입 실패')
    } finally {
      setLoading(false)
    }
  }

  if (pending) return (
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
            <span>StoryFit — 회원가입</span>
          </div>
          <div className="win-controls">
            <button>_</button><button>▢</button><button>×</button>
          </div>
        </div>
        <div className="shell-body" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Win title="가입 완료" className="login-card">
            <div className="login-screen" style={{ paddingTop: 0, alignItems: 'center', textAlign: 'center', gap: 16 }}>
              <PixelAvatar kind="ai" size={48} />
              <div>
                <div className="login-title" style={{ marginBottom: 6 }}>승인 대기 중</div>
                <div className="tiny muted" style={{ lineHeight: 1.7 }}>
                  회원가입이 완료되었습니다.<br />
                  관리자 승인 후 로그인하실 수 있습니다.
                </div>
              </div>
              <div style={{ width: '100%', background: 'var(--lemon)', border: '1px solid var(--chrome-border)', borderRadius: 4, padding: '10px 14px' }}>
                <div className="tiny" style={{ color: '#7a6200' }}>
                  ✦ <strong>{email}</strong> 계정이 관리자의 검토 대기 중입니다.
                </div>
              </div>
              <Link href="/login" style={{ color: '#ff8fcf', textDecoration: 'none', fontSize: 11 }}>
                로그인 화면으로 돌아가기
              </Link>
            </div>
          </Win>
        </div>
      </div>
    </div>
  )

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
            <span>StoryFit — 회원가입</span>
          </div>
          <div className="win-controls">
            <button>_</button><button>▢</button><button>×</button>
          </div>
        </div>

        <div className="shell-body" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Win title="회원가입 (Register)" className="login-card">
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
                  <label className="label">비밀번호 (8자 이상)</label>
                  <input
                    className="field"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    style={password.length > 0 && password.length < 8 ? { borderColor: '#ff6b8a' } : {}}
                  />
                  {password.length > 0 && password.length < 8 && (
                    <div className="tiny" style={{ color: '#ff6b8a', marginTop: 3 }}>8자 이상 입력해주세요</div>
                  )}
                </div>
                <div>
                  <label className="label">비밀번호 확인</label>
                  <input
                    className="field"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    style={passwordMismatch ? { borderColor: '#ff6b8a' } : {}}
                  />
                  {passwordMismatch && (
                    <div className="tiny" style={{ color: '#ff6b8a', marginTop: 3 }}>비밀번호가 일치하지 않습니다</div>
                  )}
                </div>
                {error && <div className="tiny" style={{ color: '#ff6b8a' }}>{error}</div>}
                <button
                  className="btn primary"
                  type="submit"
                  disabled={loading || !isValid}
                  style={{ marginTop: 4 }}
                >
                  {loading ? '처리 중...' : '✦ 회원가입'}
                </button>
              </form>

              <div className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>
                이미 계정이 있으신가요?{' '}
                <Link href="/login" style={{ color: '#ff8fcf', textDecoration: 'none' }}>
                  로그인
                </Link>
              </div>
            </div>
          </Win>
        </div>
      </div>
    </div>
  )
}
