'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import { AdminNav } from '../page'

export default function AdminConfigPage() {
  const [globalRules, setGlobalRules] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/admin/config').then((data: Record<string, string>) => {
      setGlobalRules(data.global_rules ?? '')
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await api.patch('/api/admin/config', { global_rules: globalRules })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setLoading(false) }
  }

  return (
    <Win title="관리자 — 전역 설정" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 12, flex: 1, minHeight: 0, padding: 4 }}>
        <AdminNav current="/admin/config" />

        <div className="vstack" style={{ gap: 6 }}>
          <div>
            <label className="label">전역 컨텍스트 (모든 대화 시스템 프롬프트 맨 앞에 삽입)</label>
            <div className="tiny muted" style={{ marginBottom: 6 }}>
              콘텐츠 정책, 플랫폼 규칙 등 모든 캐릭터에 공통 적용되는 지시문을 입력하세요.
            </div>
            <textarea
              className="field" rows={10}
              placeholder={"예:\n이 플랫폼은 순수한 픽션 기반 롤플레이 서비스입니다.\n실제 인물, 특정 기업, 민감한 정치적 내용은 다루지 않습니다."}
              value={globalRules}
              onChange={e => setGlobalRules(e.target.value)}
            />
          </div>
          <div className="hstack" style={{ gap: 6 }}>
            <button className="btn primary" disabled={loading} onClick={handleSave}>
              {loading ? '저장 중...' : '✦ 저장'}
            </button>
            {saved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨</span>}
          </div>
        </div>
      </div>
    </Win>
  )
}
