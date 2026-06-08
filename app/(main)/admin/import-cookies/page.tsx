'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

type CookieEntry = { value: string; updatedAt: string | null }
type CookieData = Record<'whif_session_cookie' | 'melting_session_cookie', CookieEntry>

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '저장된 값 없음'
  return `마지막 갱신: ${new Date(iso).toLocaleString('ko-KR')}`
}

function CookieField({
  label, hint, placeholder, value, onChange, updatedAt,
}: {
  label: string
  hint: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  updatedAt: string | null
}) {
  return (
    <div className="vstack" style={{ gap: 4 }}>
      <label className="label">{label}</label>
      <div className="tiny muted" style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{hint}</div>
      <textarea
        className="field"
        rows={4}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, wordBreak: 'break-all' }}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <span className="tiny muted">{formatUpdatedAt(updatedAt)}</span>
    </div>
  )
}

export default function AdminImportCookiesPage() {
  const [whifCookie, setWhifCookie] = useState('')
  const [whifUpdatedAt, setWhifUpdatedAt] = useState<string | null>(null)
  const [meltingCookie, setMeltingCookie] = useState('')
  const [meltingUpdatedAt, setMeltingUpdatedAt] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = () => {
    api.get('/api/admin/import-cookies').then((data: CookieData) => {
      setWhifCookie(data.whif_session_cookie?.value ?? '')
      setWhifUpdatedAt(data.whif_session_cookie?.updatedAt ?? null)
      setMeltingCookie(data.melting_session_cookie?.value ?? '')
      setMeltingUpdatedAt(data.melting_session_cookie?.updatedAt ?? null)
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await api.patch('/api/admin/import-cookies', {
        whif_session_cookie: whifCookie,
        melting_session_cookie: meltingCookie,
      })
      setSaved(true)
      load()
      setTimeout(() => setSaved(false), 2000)
    } finally { setLoading(false) }
  }

  return (
    <Win title="관리자 — 가져오기 세션 쿠키" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 0, flex: 1, minHeight: 0 }}>
        <div style={{ padding: 4, paddingBottom: 0 }}>
          <AdminNav current="/admin/import-cookies" />
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 4 }}>
          <div className="vstack" style={{ gap: 16 }}>

            <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)' }}>
              <div className="tiny" style={{ color: 'var(--purple)', fontWeight: 700, marginBottom: 4 }}>이게 뭔가요?</div>
              <div className="tiny muted" style={{ lineHeight: 1.7 }}>
                WHIF·멜팅(melting.chat)에서 로그인이 필요한 캐릭터를 가져올 때, 사용자가 직접 로그인한 브라우저의
                세션 쿠키를 그대로 주입해 재사용합니다. 여기서 값을 저장하면 <b>재배포 없이 즉시</b> 다음 가져오기 요청부터 반영됩니다.
                값을 비워두면 비로그인 상태의 미리보기 텍스트만 사용합니다 (정상 동작).
              </div>
            </div>

            <CookieField
              label="WHIF 세션 쿠키 (whif.io)"
              hint={'브라우저에서 whif.io에 로그인한 뒤 개발자도구 → Network 탭 → 요청의 Cookie 헤더 값 전체를 복사해 붙여넣으세요.\n예: "name1=value1; name2=value2" — 보통 30일 정도 유지됩니다.'}
              placeholder="wcs_bt=...; ch-session-XXXXXX=eyJ...; ..."
              value={whifCookie}
              onChange={setWhifCookie}
              updatedAt={whifUpdatedAt}
            />

            <CookieField
              label="멜팅 세션 쿠키 (melting.chat)"
              hint={'브라우저에서 melting.chat에 로그인한 뒤 개발자도구 → Application/저장소 → Cookies → __Host-melting_session 값을 복사해 붙여넣으세요.\n⚠️ 약 30분마다 만료됩니다 — 캐릭터를 가져오기 직전에 새로 복사해 저장하는 것을 권장합니다.'}
              placeholder="__Host-melting_session=eyJ...; __Host-melting_session_exp=..."
              value={meltingCookie}
              onChange={setMeltingCookie}
              updatedAt={meltingUpdatedAt}
            />

            <div className="hstack" style={{ gap: 6 }}>
              <button className="btn primary" disabled={loading} onClick={handleSave}>
                {loading ? '저장 중...' : '✦ 저장'}
              </button>
              {saved && <span className="tiny" style={{ color: '#22a06b' }}>✓ 저장됨 — 다음 가져오기부터 바로 적용</span>}
            </div>
          </div>
        </div>
      </div>
    </Win>
  )
}
