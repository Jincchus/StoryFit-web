'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('')
  const [personalRules, setPersonalRules] = useState('')
  const [adminGlobalRules, setAdminGlobalRules] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/user/settings').then((data: any) => {
      setDisplayName(data.displayName ?? '')
      setPersonalRules(data.personalRules ?? '')
      setAdminGlobalRules(data.adminGlobalRules ?? '')
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await api.patch('/api/user/settings', { displayName, personalRules })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setLoading(false) }
  }

  return (
    <Win title="설정" icon={PixelIcons.settings}>
      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 12 }}>
        <div className="vstack" style={{ gap: 20 }}>

          <div className="vstack" style={{ gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>프로필</div>
            <div>
              <label className="label">표시 이름</label>
              <input
                className="field"
                placeholder="닉네임 (비워두면 이메일 앞부분으로 표시)"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>
          </div>

          <div className="vstack" style={{ gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>AI 프롬프트 설정</div>

            {adminGlobalRules.trim() && (
              <div>
                <div className="label">관리자 공통 규칙 <span className="tiny muted">(읽기 전용)</span></div>
                <div style={{
                  padding: '8px 10px',
                  background: 'rgba(0,0,0,0.05)',
                  border: '1px solid var(--chrome-border)',
                  fontSize: 10,
                  color: 'var(--ink-soft)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7,
                  fontFamily: 'var(--font-mono)',
                }}>{adminGlobalRules}</div>
              </div>
            )}

            <div>
              <label className="label">
                내 개인 전역 설정 <span className="tiny muted">(모든 대화의 시스템 프롬프트 맨 앞에 삽입)</span>
              </label>
              <textarea
                className="field"
                rows={6}
                placeholder={"예: 응답은 항상 반말로 해주세요.\n장면 묘사를 풍부하게 작성해주세요."}
                value={personalRules}
                onChange={e => setPersonalRules(e.target.value)}
              />
            </div>
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
