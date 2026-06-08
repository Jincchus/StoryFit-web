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
    <Win title="관리자 — 가져오기 인증" icon={PixelIcons.settings}>
      <div className="vstack" style={{ gap: 0, flex: 1, minHeight: 0 }}>
        <div style={{ padding: 4, paddingBottom: 0 }}>
          <AdminNav current="/admin/import-cookies" />
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: 4 }}>
          <div className="vstack" style={{ gap: 16 }}>

            <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)' }}>
              <div className="tiny" style={{ color: 'var(--purple)', fontWeight: 700, marginBottom: 4 }}>이게 뭔가요?</div>
              <div className="tiny muted" style={{ lineHeight: 1.7 }}>
                WHIF·멜팅(melting.chat)에서 로그인이 필요한 캐릭터를 가져올 때 사용하는 인증 정보입니다.
                여기서 값을 저장하면 <b>재배포 없이 즉시</b> 다음 가져오기 요청부터 반영됩니다.
                값을 비워두면 비로그인 상태의 미리보기 텍스트만 사용합니다 (정상 동작).
              </div>
            </div>

            <CookieField
              label="WHIF 인증 토큰 (whif.io)"
              hint={'브라우저에서 whif.io에 로그인한 뒤 아래 방법으로 토큰을 복사해 붙여넣으세요.\n\n방법 A (권장): 개발자도구 → Application(저장소) → Local Storage → https://www.whif.io → sb-beizfkcdgqkvhqcqvtwk-auth-token 항목 클릭 → Value란에서 JSON 확인 → access_token 값만 복사\n\n방법 B: 개발자도구 → Network 탭 → 아무 API 요청 클릭 → Headers → Authorization 헤더 값 복사\n\n⚠️ JWT는 약 7일마다 만료됩니다 — 가져오기가 다시 안 되면 이 화면에서 토큰을 교체하세요.'}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ..."
              value={whifCookie}
              onChange={setWhifCookie}
              updatedAt={whifUpdatedAt}
            />

            <CookieField
              label="멜팅 세션 쿠키 (melting.chat) — 끊겼을 때 복구용"
              hint={'서버가 로그인 상태를 영속 브라우저 프로필에 저장해 가져오기마다 재사용을 시도하므로, 활동이 잦으면 따로 갱신하지 않아도 동작할 수 있습니다.\n아래 값은 그 영속 세션이 끊긴 게 감지됐을 때 자동 복구용 "시드"로만 쓰입니다 — 가져오기가 잘 되고 있다면 비워둬도 됩니다.\n가져오기에서 로그인 정보가 빠진다면: 브라우저에서 melting.chat에 로그인한 뒤 개발자도구 → Application/저장소 → Cookies → __Host-melting_session 값을 복사해 붙여넣고 저장하세요.\n⚠️ 참고: 활동과 무관하게 발급 시점 기준으로 30분 뒤 만료되는 구조라면, 영속 세션도 결국 끊기고 이 시드 값을 다시 입력해야 할 수 있습니다 — 직접 운용해보면서 확인해야 하는 부분입니다.'}
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
