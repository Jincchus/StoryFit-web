'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface UserRow {
  id: string
  email: string
  isAdmin: boolean
  isActive: boolean
  isApproved: boolean
  _count: { conversations: number }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/users').then(setUsers).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const patch = async (id: string, data: Partial<{ isAdmin: boolean; isActive: boolean; isApproved: boolean }>) => {
    try {
      const updated = await api.patch(`/api/admin/users/${id}`, data)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updated } : u))
    } catch (e: any) { alert(e.message) }
  }

  const pending = users.filter(u => !u.isApproved)
  const approved = users.filter(u => u.isApproved)

  return (
    <Win title="관리자 — 유저 관리" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/users" />
        <div className="tiny muted">총 {users.length}명 · 승인 대기 {pending.length}명</div>

        {loading ? (
          <div className="tiny muted" style={{ padding: 20 }}>불러오는 중...</div>
        ) : (
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>이메일</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>대화</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>관리자</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>활성</th>
                  <th style={{ padding: '4px 8px', fontWeight: 700 }}>승인</th>
                </tr>
              </thead>
              <tbody>
                {[...pending, ...approved].map(u => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--chrome-border)',
                      opacity: u.isActive ? 1 : 0.5,
                      background: !u.isApproved ? 'var(--lemon)' : undefined,
                    }}
                  >
                    <td style={{ padding: '5px 8px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                      {u.email}
                      {!u.isApproved && (
                        <span style={{ marginLeft: 6, fontSize: 9, background: '#ff9500', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
                          대기
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '5px 8px', color: 'var(--ink-soft)' }}>{u._count.conversations}</td>
                    <td style={{ padding: '5px 8px' }}>
                      <button
                        className={`btn ${u.isAdmin ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={() => patch(u.id, { isAdmin: !u.isAdmin })}
                      >{u.isAdmin ? '✓ 관리자' : '일반'}</button>
                    </td>
                    <td style={{ padding: '5px 8px' }}>
                      <button
                        className={`btn ${u.isActive ? 'ghost' : 'danger'}`}
                        style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={() => patch(u.id, { isActive: !u.isActive })}
                      >{u.isActive ? '활성' : '정지됨'}</button>
                    </td>
                    <td style={{ padding: '5px 8px' }}>
                      {u.isApproved ? (
                        <button
                          className="btn ghost"
                          style={{ fontSize: 9, padding: '1px 6px' }}
                          disabled
                        >✓ 승인됨</button>
                      ) : (
                        <button
                          className="btn primary"
                          style={{ fontSize: 9, padding: '1px 8px' }}
                          onClick={() => patch(u.id, { isApproved: true })}
                        >✦ 승인</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Win>
  )
}
