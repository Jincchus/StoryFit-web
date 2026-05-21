'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface DailyRow { date: string; inputTokens: number; outputTokens: number; count: number; costUsd: number }
interface CostData {
  total: { inputTokens: number; outputTokens: number; costUsd: number }
  daily: DailyRow[]
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null)

  useEffect(() => {
    api.get('/api/admin/costs').then(setData).catch(() => {})
  }, [])

  return (
    <Win title="관리자 — AI 비용 모니터링" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/costs" />

        {!data ? (
          <div className="tiny muted">불러오는 중...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { label: '총 입력 토큰', value: fmt(data.total.inputTokens) },
                { label: '총 출력 토큰', value: fmt(data.total.outputTokens) },
                { label: '누적 추정 비용', value: `$${data.total.costUsd.toFixed(4)}` },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 16px', background: 'var(--pane)', border: '1px solid var(--chrome-border)' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                  <div className="tiny muted">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="tiny muted" style={{ marginTop: 2 }}>
              Gemini 2.5 Flash 기준 — 입력 $0.15/1M, 출력 $0.60/1M
            </div>

            <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                    {['날짜', '입력 토큰', '출력 토큰', 'AI 응답 수', '추정 비용'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map(row => (
                    <tr key={row.date} style={{ borderBottom: '1px solid var(--chrome-border)' }}>
                      <td style={{ padding: '4px 8px' }}>{row.date}</td>
                      <td style={{ padding: '4px 8px' }}>{fmt(row.inputTokens)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmt(row.outputTokens)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmt(row.count)}</td>
                      <td style={{ padding: '4px 8px' }}>${row.costUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                  {data.daily.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-soft)' }}>데이터가 없습니다</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Win>
  )
}
