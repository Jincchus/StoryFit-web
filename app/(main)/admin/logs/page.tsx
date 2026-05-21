'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

interface LogEntry { id: string; adminEmail: string; action: string; detail: string; createdAt: string }

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  const load = async (p: number) => {
    const data = await api.get(`/api/admin/logs?page=${p}`).catch(() => null)
    if (!data) return
    setLogs(data.logs)
    setPages(data.pages)
    setPage(data.page)
  }

  useEffect(() => { load(1) }, [])

  return (
    <Win title="관리자 — 활동 로그" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/logs" />

        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                {['시간', '관리자', '액션', '상세'].map(h => (
                  <th key={h} style={{ padding: '4px 8px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--chrome-border)' }}>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                    {new Date(log.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{log.adminEmail}</td>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', fontWeight: 600 }}>{log.action}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--ink-soft)' }}>{log.detail}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: 'var(--ink-soft)' }}>로그가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
            <button className="btn ghost" style={{ fontSize: 10 }} disabled={page <= 1} onClick={() => load(page - 1)}>← 이전</button>
            <span className="tiny muted">{page} / {pages}</span>
            <button className="btn ghost" style={{ fontSize: 10 }} disabled={page >= pages} onClick={() => load(page + 1)}>다음 →</button>
          </div>
        )}
      </div>
    </Win>
  )
}
