'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import { AdminNav } from '../page'

interface UserRow {
  id: string
  email: string
  isAdmin: boolean
  isActive: boolean
  _count: { conversations: number }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])

  useEffect(() => {
    api.get('/api/admin/users').then(setUsers).catch(() => {})
  }, [])

  const toggle = async (id: string, field: 'isAdmin' | 'isActive', current: boolean) => {
    try {
      const updated = await api.patch(`/api/admin/users/${id}`, { [field]: !current })
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updated } : u))
    } catch (e: any) { alert(e.message) }
  }

  return (
    <Win title="관리자 — 유저 관리" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/users" />
        <div className="tiny muted">총 {users.length}명</div>
        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px', fontWeight: 700 }}>이메일</th>
                <th style={{ padding: '4px 8px', fontWeight: 700 }}>대화</th>
                <th style={{ padding: '4px 8px', fontWeight: 700 }}>관리자</th>
                <th style={{ padding: '4px 8px', fontWeight: 700 }}>활성</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--chrome-border)', opacity: u.isActive ? 1 : 0.5 }}>
                  <td style={{ padding: '5px 8px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{u.email}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--ink-soft)' }}>{u._count.conversations}</td>
                  <td style={{ padding: '5px 8px' }}>
                    <button
                      className={`btn ${u.isAdmin ? 'primary' : 'ghost'}`}
                      style={{ fontSize: 9, padding: '1px 6px' }}
                      onClick={() => toggle(u.id, 'isAdmin', u.isAdmin)}
                    >{u.isAdmin ? '✓ 관리자' : '일반'}</button>
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <button
                      className={`btn ${u.isActive ? 'ghost' : 'danger'}`}
                      style={{ fontSize: 9, padding: '1px 6px' }}
                      onClick={() => toggle(u.id, 'isActive', u.isActive)}
                    >{u.isActive ? '활성' : '정지됨'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Win>
  )
}
