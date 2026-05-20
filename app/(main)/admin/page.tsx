'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from './_components/AdminNav'

interface Stats { users: number; conversations: number; messages: number; recentConvs: number }

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get('/api/admin/stats').then(setStats).catch(() => {})
  }, [])

  return (
    <Win title="관리자 — 대시보드" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin" />
        {!stats ? (
          <div className="tiny muted">불러오는 중...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {[
              { label: '전체 유저', value: stats.users },
              { label: '전체 대화', value: stats.conversations },
              { label: '전체 메시지', value: stats.messages },
              { label: '최근 7일 새 대화', value: stats.recentConvs },
            ].map(s => (
              <div key={s.label} style={{ padding: '12px 16px', background: 'var(--pane)', border: '1px solid var(--chrome-border)' }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{s.value}</div>
                <div className="tiny muted">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Win>
  )
}
