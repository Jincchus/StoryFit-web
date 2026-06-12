'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

export default function SecurityTab() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  const changePw = async () => {
    setPwError(''); setPwSaved(false)
    if (newPw.length < 8) { setPwError('새 비밀번호는 8자 이상이어야 합니다.'); return }
    if (newPw !== confirmPw) { setPwError('새 비밀번호가 일치하지 않습니다.'); return }
    setPwLoading(true)
    try {
      await api.patch('/api/user/password', { currentPassword: currentPw, newPassword: newPw })
      setPwSaved(true); setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => setPwSaved(false), 2000)
    } catch (e: any) {
      setPwError(e.message ?? '오류가 발생했습니다.')
    } finally { setPwLoading(false) }
  }

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--chrome-border)', paddingBottom: 4 }}>비밀번호 변경</div>
      <div className="vstack" style={{ gap: 8 }}>
        <div>
          <label className="label">현재 비밀번호</label>
          <input className="field" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
        </div>
        <div>
          <label className="label">새 비밀번호 <span className="tiny muted">(8자 이상)</span></label>
          <input className="field" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
        </div>
        <div>
          <label className="label">새 비밀번호 확인</label>
          <input className="field" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') changePw() }} />
        </div>
        {pwError && <div className="tiny" style={{ color: 'var(--danger)' }}>{pwError}</div>}
      </div>
      <div className="hstack" style={{ gap: 6 }}>
        <button className="btn primary" disabled={pwLoading || !currentPw || !newPw || !confirmPw} onClick={changePw}>{pwLoading ? '변경 중...' : '비밀번호 변경'}</button>
        {pwSaved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 변경됨</span>}
      </div>
    </div>
  )
}
