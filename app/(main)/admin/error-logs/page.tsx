'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ErrorLog {
  id: string
  createdAt: string
  userId: string
  conversationId: string
  provider: string
  mode: string
  errorType: string
  statusCode: number
  message: string
  inputTokens: number
  outputTokens: number
}

const ERROR_TYPE_LABEL: Record<string, string> = {
  api_error: 'API 오류',
  timeout: '타임아웃',
  empty_response: '빈 응답',
  partial_save: '부분 저장',
  network: '네트워크',
}

const ERROR_TYPE_COLOR: Record<string, string> = {
  api_error: '#e00',
  timeout: '#ff9500',
  empty_response: '#8b5cf6',
  partial_save: '#2196f3',
  network: '#e00',
}

const PROVIDER_FILTERS = ['', 'gemini', 'claude', 'chatgpt']
const TYPE_FILTERS = ['', 'api_error', 'timeout', 'empty_response', 'partial_save', 'network']

export default function ErrorLogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [providerFilter, setProviderFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const load = (provider = providerFilter, errorType = typeFilter) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (provider) params.set('provider', provider)
    if (errorType) params.set('errorType', errorType)
    api.get(`/api/admin/error-logs?${params}`)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleProviderFilter = (v: string) => { setProviderFilter(v); load(v, typeFilter) }
  const handleTypeFilter = (v: string) => { setTypeFilter(v); load(providerFilter, v) }

  const handleClear = async () => {
    await api.delete('/api/admin/error-logs')
    setLogs([])
    setConfirmClear(false)
  }

  const counts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.errorType] = (acc[l.errorType] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      {confirmClear && (
        <ConfirmDialog
          message="모든 오류 로그를 삭제할까요?"
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      <Win title="관리자 — AI 오류 로그" icon={PixelIcons.settings}>
        <div className="vstack" style={{ gap: 10, flex: 1, minHeight: 0, padding: 4 }}>
          <AdminNav current="/admin/error-logs" />

          <div className="hstack" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="tiny muted">총 {logs.length}건</div>
            {Object.entries(counts).map(([type, n]) => (
              <div key={type} className="tiny" style={{ color: ERROR_TYPE_COLOR[type] ?? 'var(--ink)' }}>
                {ERROR_TYPE_LABEL[type] ?? type}: {n}
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => load()}>↺ 새로고침</button>
            {logs.length > 0 && (
              <button className="btn danger" style={{ fontSize: 10 }} onClick={() => setConfirmClear(true)}>전체 삭제</button>
            )}
          </div>

          <div className="hstack" style={{ gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
            {PROVIDER_FILTERS.map(p => (
              <button
                key={p}
                className={`btn ${providerFilter === p ? 'primary' : 'ghost'}`}
                style={{ fontSize: 10, padding: '2px 8px' }}
                onClick={() => handleProviderFilter(p)}
              >{p || '전체 모델'}</button>
            ))}
            <div style={{ width: 8 }} />
            {TYPE_FILTERS.map(t => (
              <button
                key={t}
                className={`btn ${typeFilter === t ? 'primary' : 'ghost'}`}
                style={{ fontSize: 10, padding: '2px 8px' }}
                onClick={() => handleTypeFilter(t)}
              >{t ? (ERROR_TYPE_LABEL[t] ?? t) : '전체 유형'}</button>
            ))}
          </div>

          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowX: 'auto' }}>
            {loading ? (
              <div className="tiny muted" style={{ padding: 20 }}>불러오는 중...</div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: 28 }}>✓</div>
                <div className="tiny muted" style={{ marginTop: 8 }}>오류 로그가 없습니다</div>
              </div>
            ) : (
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--chrome-border)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 700 }}>시각</th>
                    <th style={{ padding: '4px 8px', fontWeight: 700 }}>유형</th>
                    <th style={{ padding: '4px 8px', fontWeight: 700 }}>모델</th>
                    <th style={{ padding: '4px 8px', fontWeight: 700 }}>모드</th>
                    <th style={{ padding: '4px 8px', fontWeight: 700 }}>상태</th>
                    <th style={{ padding: '4px 8px', fontWeight: 700 }}>메시지</th>
                    <th style={{ padding: '4px 8px', fontWeight: 700 }}>토큰</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--chrome-border)' }}>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                        {new Date(log.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 9, background: ERROR_TYPE_COLOR[log.errorType] ?? '#888', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>
                          {ERROR_TYPE_LABEL[log.errorType] ?? log.errorType}
                        </span>
                      </td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{log.provider || '—'}</td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>{log.mode || '—'}</td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: log.statusCode >= 400 ? '#e00' : 'var(--ink-soft)' }}>
                        {log.statusCode || '—'}
                      </td>
                      <td style={{ padding: '5px 8px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                        {log.message || '—'}
                      </td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                        {log.inputTokens || log.outputTokens ? `↑${log.inputTokens} ↓${log.outputTokens}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Win>
    </>
  )
}
