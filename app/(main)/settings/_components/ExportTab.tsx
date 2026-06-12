'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface ConvSummary {
  id: string
  title: string
  updatedAt: string
  mode: string
  characters: { character: { name: string } }[]
}

export default function ExportTab() {
  const [convList, setConvList] = useState<ConvSummary[]>([])
  const [exportLoading, setExportLoading] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/conversations').then((d: any) => setConvList(d ?? [])).catch(() => {})
  }, [])

  const downloadExport = async (id?: string) => {
    const key = id ?? 'all'
    setExportLoading(key)
    try {
      const url = id ? `/api/user/export?id=${id}` : '/api/user/export'
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="(.+)"/)?.[1] ?? 'storyfit-export.json'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } finally { setExportLoading(null) }
  }

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>대화 내보내기</div>
      <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--chrome-border)', fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
        JSON 형식으로 다운로드합니다. 대화 내용과 메시지 전체가 포함됩니다.
      </div>
      <button
        className="btn primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={exportLoading === 'all'}
        onClick={() => downloadExport()}
      >
        {exportLoading === 'all' ? '내보내는 중...' : '전체 대화 내보내기'}
      </button>
      {convList.length > 0 && (
        <div className="vstack" style={{ gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>개별 내보내기</div>
          {convList.map((c: ConvSummary) => (
            <div key={c.id} className="spread" style={{ padding: '6px 10px', border: '1px solid var(--chrome-border)', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                <div className="tiny muted">
                  {c.characters?.[0]?.character?.name ?? '—'} · {c.mode} · {new Date(c.updatedAt).toLocaleDateString('ko-KR')}
                </div>
              </div>
              <button
                className="btn ghost"
                style={{ fontSize: 10, flexShrink: 0 }}
                disabled={exportLoading === c.id}
                onClick={() => downloadExport(c.id)}
              >
                {exportLoading === c.id ? '...' : '↓ 저장'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
