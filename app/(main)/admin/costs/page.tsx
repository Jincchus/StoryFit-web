'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface Row { inputTokens: number; outputTokens: number; count: number; costUsd: number; costKrw: number }
interface CostData {
  krwPerUsd: number
  pricing: { inputPerM: number; outputPerM: number; model: string }
  total: Row
  thisMonth: Row & { projectedCostUsd: number; projectedCostKrw: number; daysElapsed: number; daysInMonth: number }
  lastMonth: Row
  monthly: (Row & { month: string })[]
  daily: (Row & { date: string })[]
}

const fmtN = (n: number) => n.toLocaleString('ko-KR')
const fmtUsd = (n: number) => `$${n.toFixed(4)}`
const fmtKrw = (n: number) => `₩${n.toLocaleString('ko-KR')}`

function StatCard({ label, usd, krw, sub }: { label: string; usd: number; krw: number; sub?: string }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtKrw(krw)}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{fmtUsd(usd)}</div>
      <div className="tiny muted" style={{ marginTop: 4 }}>{label}</div>
      {sub && <div className="tiny" style={{ color: 'var(--hot-pink)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null)

  useEffect(() => {
    api.get('/api/admin/costs').then(setData).catch(() => {})
  }, [])

  return (
    <Win title="관리자 — AI 비용 모니터링" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 14, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/costs" />

        {!data ? (
          <div className="tiny muted">불러오는 중...</div>
        ) : (
          <>
            <div className="tiny muted">
              {data.pricing.model} — 입력 ${data.pricing.inputPerM}/1M · 출력 ${data.pricing.outputPerM}/1M · 환율 {fmtN(data.krwPerUsd)}원/USD
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <StatCard
                label={`이번 달 비용 (${data.thisMonth.daysElapsed}일 경과)`}
                usd={data.thisMonth.costUsd}
                krw={data.thisMonth.costKrw}
                sub={`월말 예상: ${fmtKrw(data.thisMonth.projectedCostKrw)} (${fmtUsd(data.thisMonth.projectedCostUsd)})`}
              />
              <StatCard label="지난 달 비용" usd={data.lastMonth.costUsd} krw={data.lastMonth.costKrw} />
              <div style={{ padding: '12px 14px', background: 'var(--pane)', border: '1px solid var(--chrome-border)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtN(data.thisMonth.count)}회</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>평균 {data.thisMonth.daysElapsed > 0 ? Math.round(data.thisMonth.count / data.thisMonth.daysElapsed) : 0}회/일</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>이번 달 AI 응답 수</div>
              </div>
              <StatCard label="누적 총 비용" usd={data.total.costUsd} krw={data.total.costKrw} />
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>월별 내역</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                    {['월', '응답 수', '입력 토큰', '출력 토큰', 'USD', 'KRW'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map(row => (
                    <tr key={row.month} style={{ borderBottom: '1px solid var(--chrome-border)' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 600 }}>{row.month}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtN(row.count)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtN(row.inputTokens)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtN(row.outputTokens)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtUsd(row.costUsd)}</td>
                      <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--hot-pink)' }}>{fmtKrw(row.costKrw)}</td>
                    </tr>
                  ))}
                  {data.monthly.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-soft)' }}>데이터가 없습니다</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700 }}>일별 내역 (최근 30일)</div>
            <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                    {['날짜', '응답 수', '입력 토큰', '출력 토큰', 'USD', 'KRW'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map(row => (
                    <tr key={row.date} style={{ borderBottom: '1px solid var(--chrome-border)' }}>
                      <td style={{ padding: '4px 8px' }}>{row.date}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtN(row.count)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtN(row.inputTokens)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtN(row.outputTokens)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtUsd(row.costUsd)}</td>
                      <td style={{ padding: '4px 8px', fontWeight: 600 }}>{fmtKrw(row.costKrw)}</td>
                    </tr>
                  ))}
                  {data.daily.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-soft)' }}>데이터가 없습니다</td></tr>
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
