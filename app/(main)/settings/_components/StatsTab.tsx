'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Stats {
  conversationCount: number
  messageCount: number
  totalInputTokens: number
  totalOutputTokens: number
  byModel: { model: string; count: number; inputTokens: number; outputTokens: number }[]
}

const MODEL_LABELS: Record<string, string> = { gemini: 'Gemini' }

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    setStatsLoading(true)
    api.get('/api/user/stats').then((d: any) => setStats(d)).catch(() => {}).finally(() => setStatsLoading(false))
  }, [])

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>사용 통계</div>
      {statsLoading && <div className="tiny muted">로딩 중...</div>}
      {stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {[
              { label: '총 대화', value: stats.conversationCount.toLocaleString() },
              { label: '총 메시지', value: stats.messageCount.toLocaleString() },
              { label: '입력 토큰', value: fmt(stats.totalInputTokens) },
              { label: '출력 토큰', value: fmt(stats.totalOutputTokens) },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '10px 12px', border: '1px solid var(--chrome-border)', background: 'var(--pane)' }}>
                <div className="tiny muted" style={{ marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>
          {stats.byModel.length > 0 && (
            <div className="vstack" style={{ gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>AI 모델별 사용량</div>
              {stats.byModel.map(m => (
                <div key={m.model} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 6, alignItems: 'center', padding: '6px 10px', border: '1px solid var(--chrome-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{MODEL_LABELS[m.model] ?? m.model}</div>
                  <div className="tiny muted">응답 {m.count.toLocaleString()}개</div>
                  <div className="tiny muted">입력 {fmt(m.inputTokens)}</div>
                  <div className="tiny muted">출력 {fmt(m.outputTokens)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
