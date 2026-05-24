'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface UserRow {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  isActive: boolean
  isApproved: boolean
  rejectionReason: string
  _count: { conversations: number }
}

const PRESET_REASONS = [
  '서비스 이용 자격 미충족',
  '중복 가입 의심',
  '부적절한 정보 기재',
]

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectTarget, setRejectTarget] = useState<UserRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)

  useEffect(() => {
    api.get('/api/admin/users').then(setUsers).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const patch = async (id: string, data: Record<string, unknown>) => {
    try {
      const updated = await api.patch(`/api/admin/users/${id}`, data)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updated } : u))
    } catch (e: any) { alert(e.message) }
  }

  const openReject = (u: UserRow) => {
    setRejectTarget(u)
    setRejectReason('')
  }

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return
    setRejectLoading(true)
    try {
      const updated = await api.patch(`/api/admin/users/${rejectTarget.id}`, {
        isApproved: false,
        rejectionReason: rejectReason.trim(),
      })
      setUsers(prev => prev.map(u => u.id === rejectTarget.id ? { ...u, ...updated } : u))
      setRejectTarget(null)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setRejectLoading(false)
    }
  }

  const isPending = (u: UserRow) => !u.isApproved && !u.rejectionReason
  const isRejected = (u: UserRow) => !u.isApproved && !!u.rejectionReason

  const pending = users.filter(isPending)
  const rejected = users.filter(isRejected)
  const approved = users.filter(u => u.isApproved)

  return (
    <Win title="관리자 — 유저 관리" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/users" />
        <div className="tiny muted">
          총 {users.length}명 · 승인 대기 {pending.length}명 · 거절 {rejected.length}명
        </div>

        {loading ? (
          <div className="tiny muted" style={{ padding: 20 }}>불러오는 중...</div>
        ) : (
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>유저</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>대화</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>관리자</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>활성</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>가입</th>
                </tr>
              </thead>
              <tbody>
                {[...pending, ...rejected, ...approved].map(u => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--chrome-border)',
                      opacity: u.isActive ? 1 : 0.5,
                      background: isPending(u) ? 'var(--lemon)' : isRejected(u) ? '#fff0f0' : undefined,
                    }}
                  >
                    {/* 유저 */}
                    <td style={{ padding: '5px 8px', maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.displayName || <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                        {isPending(u) && (
                          <span style={{ marginLeft: 6, fontSize: 9, background: '#ff9500', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>대기</span>
                        )}
                        {isRejected(u) && (
                          <span style={{ marginLeft: 6, fontSize: 9, background: '#e00', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>거절됨</span>
                        )}
                      </div>
                      <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                      {isRejected(u) && (
                        <div className="tiny" style={{ color: '#c00', marginTop: 2 }}>사유: {u.rejectionReason}</div>
                      )}
                    </td>

                    {/* 대화 수 */}
                    <td style={{ padding: '5px 8px', color: 'var(--ink-soft)' }}>{u._count.conversations}</td>

                    {/* 관리자 */}
                    <td style={{ padding: '5px 8px' }}>
                      <button
                        className={`btn ${u.isAdmin ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={() => patch(u.id, { isAdmin: !u.isAdmin })}
                      >{u.isAdmin ? '✓ 관리자' : '일반'}</button>
                    </td>

                    {/* 활성 */}
                    <td style={{ padding: '5px 8px' }}>
                      <button
                        className={`btn ${u.isActive ? 'ghost' : 'danger'}`}
                        style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={() => patch(u.id, { isActive: !u.isActive })}
                      >{u.isActive ? '활성' : '정지됨'}</button>
                    </td>

                    {/* 가입 승인/거절 */}
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                      {u.isApproved ? (
                        <span className="tiny muted">✓ 승인됨</span>
                      ) : isRejected(u) ? (
                        <button
                          className="btn ghost"
                          style={{ fontSize: 9, padding: '1px 6px' }}
                          onClick={() => patch(u.id, { rejectionReason: '' })}
                        >재검토</button>
                      ) : (
                        <div className="vstack" style={{ gap: 3, alignItems: 'flex-start' }}>
                          <button
                            className="btn primary"
                            style={{ fontSize: 9, padding: '1px 8px' }}
                            onClick={() => patch(u.id, { isApproved: true, rejectionReason: '' })}
                          >✦ 승인</button>
                          <button
                            className="btn danger"
                            style={{ fontSize: 9, padding: '1px 8px' }}
                            onClick={() => openReject(u)}
                          >✕ 거절</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 거절 모달 */}
      {rejectTarget && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200 }}
            onClick={() => setRejectTarget(null)}
          />
          <div className="win" style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 201, width: 'min(360px, 92vw)',
          }}>
            <div className="win-title">
              <div className="win-title-l">가입 거절</div>
              <div className="win-controls"><button onClick={() => setRejectTarget(null)}>×</button></div>
            </div>
            <div className="win-body vstack" style={{ gap: 10 }}>
              <div className="tiny muted" style={{ wordBreak: 'break-all' }}>
                <b>{rejectTarget.displayName || rejectTarget.email}</b>의 가입을 거절합니다.
              </div>

              <div>
                <div className="label" style={{ marginBottom: 6 }}>거절 사유 선택</div>
                <div className="vstack" style={{ gap: 4 }}>
                  {PRESET_REASONS.map(r => (
                    <button
                      key={r}
                      className={`btn ${rejectReason === r ? 'primary' : 'ghost'}`}
                      style={{ fontSize: 10, textAlign: 'left', justifyContent: 'flex-start' }}
                      onClick={() => setRejectReason(r)}
                    >
                      {rejectReason === r ? '● ' : '○ '}{r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="label" style={{ marginBottom: 4 }}>직접 입력 <span className="tiny muted">(선택 사항)</span></div>
                <textarea
                  className="field"
                  rows={2}
                  placeholder="사유를 직접 작성하세요..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
              </div>

              <div className="hstack" style={{ gap: 6 }}>
                <button
                  className="btn danger"
                  disabled={!rejectReason.trim() || rejectLoading}
                  onClick={confirmReject}
                >
                  {rejectLoading ? '처리 중...' : '✕ 거절 확정'}
                </button>
                <button className="btn ghost" onClick={() => setRejectTarget(null)}>취소</button>
              </div>
            </div>
          </div>
        </>
      )}
    </Win>
  )
}
