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

  const [recovering, setRecovering] = useState(false)

  const handleRecover = async () => {
    if (!window.confirm('부모가 삭제된 고아 브랜치 대화들을 검색하고 복구하시겠습니까?\n가장 오래된 브랜치가 새 루트 대화로 승격됩니다.')) return
    setRecovering(true)
    try {
      const res = await api.post('/api/admin/recover-orphans', {})
      alert(`복구 완료: 총 ${res.recovered || 0}개의 그룹이 복구되었습니다.`)
    } catch (err: any) {
      alert(`복구 실패: ${err?.message || '알 수 없는 오류가 발생했습니다.'}`)
    } finally {
      setRecovering(false)
    }
  }

  return (
    <Win title="관리자 — 대시보드" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin" />
        {!stats ? (
          <div className="tiny muted">불러오는 중...</div>
        ) : (
          <div className="vstack" style={{ gap: 12 }}>
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

            <div style={{ padding: '12px 16px', background: 'var(--pane)', border: '1px solid var(--chrome-border)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🧹 데이터 정리 도구</div>
              <div className="tiny muted" style={{ marginBottom: 10, lineHeight: 1.4 }}>
                부모 대화방이 영구 삭제되어 내비게이션에 나타나지 않는 고아 브랜치(분기) 대화방들을 탐색하여 복구합니다. 가장 오래된 대화방이 새 루트가 되고 나머지는 연결됩니다.
              </div>
              <button
                className="btn primary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                disabled={recovering}
                onClick={handleRecover}
              >
                {recovering ? '복구 진행 중...' : '고아 브랜치 일괄 복구 실행'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Win>
  )
}
