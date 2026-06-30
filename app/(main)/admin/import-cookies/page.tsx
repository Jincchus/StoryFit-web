'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Win from '@/components/ui/Win'
import { PixelIcons } from '@/components/ui/PixelAvatar'
import AdminNav from '../_components/AdminNav'

type CookieEntry = { value: string; updatedAt: string | null }
type CookieData = Record<'whif_session_cookie' | 'whif_persona_id' | 'melting_session_cookie' | 'melting_session_nickname' | 'babechat_access_token' | 'babechat_refresh_token' | 'tingle_auth_token' | 'tingle_refresh_token' | 'tingle_firebase_api_key' | 'zeta_token' | 'rofan_session_cookie', CookieEntry>

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

function NicknameField({
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
      <input
        className="field"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
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
  const [whifPersonaId, setWhifPersonaId] = useState('')
  const [whifPersonaUpdatedAt, setWhifPersonaUpdatedAt] = useState<string | null>(null)
  const [meltingCookie, setMeltingCookie] = useState('')
  const [meltingUpdatedAt, setMeltingUpdatedAt] = useState<string | null>(null)
  const [meltingNickname, setMeltingNickname] = useState('')
  const [meltingNicknameUpdatedAt, setMeltingNicknameUpdatedAt] = useState<string | null>(null)
  const [babechatAccess, setBabechatAccess] = useState('')
  const [babechatAccessUpdatedAt, setBabechatAccessUpdatedAt] = useState<string | null>(null)
  const [babechatRefresh, setBabechatRefresh] = useState('')
  const [babechatRefreshUpdatedAt, setBabechatRefreshUpdatedAt] = useState<string | null>(null)
  const [tingleToken, setTingleToken] = useState('')
  const [tingleTokenUpdatedAt, setTingleTokenUpdatedAt] = useState<string | null>(null)
  const [tingleRefresh, setTingleRefresh] = useState('')
  const [tingleRefreshUpdatedAt, setTingleRefreshUpdatedAt] = useState<string | null>(null)
  const [tingleApiKey, setTingleApiKey] = useState('')
  const [tingleApiKeyUpdatedAt, setTingleApiKeyUpdatedAt] = useState<string | null>(null)
  const [zetaToken, setZetaToken] = useState('')
  const [zetaTokenUpdatedAt, setZetaTokenUpdatedAt] = useState<string | null>(null)
  const [rofanCookie, setRofanCookie] = useState('')
  const [rofanCookieUpdatedAt, setRofanCookieUpdatedAt] = useState<string | null>(null)
  const [tingleOpen, setTingleOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = () => {
    api.get('/api/admin/import-cookies').then((data: CookieData) => {
      setWhifCookie(data.whif_session_cookie?.value ?? '')
      setWhifUpdatedAt(data.whif_session_cookie?.updatedAt ?? null)
      setWhifPersonaId(data.whif_persona_id?.value ?? '')
      setWhifPersonaUpdatedAt(data.whif_persona_id?.updatedAt ?? null)
      setMeltingCookie(data.melting_session_cookie?.value ?? '')
      setMeltingUpdatedAt(data.melting_session_cookie?.updatedAt ?? null)
      setMeltingNickname(data.melting_session_nickname?.value ?? '')
      setMeltingNicknameUpdatedAt(data.melting_session_nickname?.updatedAt ?? null)
      setBabechatAccess(data.babechat_access_token?.value ?? '')
      setBabechatAccessUpdatedAt(data.babechat_access_token?.updatedAt ?? null)
      setBabechatRefresh(data.babechat_refresh_token?.value ?? '')
      setBabechatRefreshUpdatedAt(data.babechat_refresh_token?.updatedAt ?? null)
      setTingleToken(data.tingle_auth_token?.value ?? '')
      setTingleTokenUpdatedAt(data.tingle_auth_token?.updatedAt ?? null)
      setTingleRefresh(data.tingle_refresh_token?.value ?? '')
      setTingleRefreshUpdatedAt(data.tingle_refresh_token?.updatedAt ?? null)
      setTingleApiKey(data.tingle_firebase_api_key?.value ?? '')
      setTingleApiKeyUpdatedAt(data.tingle_firebase_api_key?.updatedAt ?? null)
      setZetaToken(data.zeta_token?.value ?? '')
      setZetaTokenUpdatedAt(data.zeta_token?.updatedAt ?? null)
      setRofanCookie(data.rofan_session_cookie?.value ?? '')
      setRofanCookieUpdatedAt(data.rofan_session_cookie?.updatedAt ?? null)
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      await api.patch('/api/admin/import-cookies', {
        whif_session_cookie: whifCookie,
        whif_persona_id: whifPersonaId,
        melting_session_cookie: meltingCookie,
        melting_session_nickname: meltingNickname,
        babechat_access_token: babechatAccess,
        babechat_refresh_token: babechatRefresh,
        tingle_auth_token: tingleToken,
        tingle_refresh_token: tingleRefresh,
        tingle_firebase_api_key: tingleApiKey,
        zeta_token: zetaToken,
        rofan_session_cookie: rofanCookie,
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
                WHIF·멜팅(melting.chat)·babechat에서 로그인이 필요한 캐릭터를 가져올 때 사용하는 인증 정보입니다.
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

            <NicknameField
              label="WHIF 페르소나 ID (공개 키워드북 가져오기용)"
              hint={'WHIF 공개 키워드북(로어북)은 채팅방을 만들어야만 읽을 수 있고, 채팅방 생성에는 페르소나가 필요합니다.\n위 WHIF 계정의 페르소나 id를 넣어두면, 가져오기 시 일회용 채팅방을 만들어 공개 로어북을 함께 수집합니다.\n\n찾는 법: 캐릭터와 채팅을 시작한 뒤 개발자도구 → Network → ChatRoomService/CreateChatRoom(또는 GetChatRoom) 요청 → Payload의 userPersonaId 값을 복사.\n비워두면 로어북 수집만 건너뛰고 나머지 가져오기는 정상 동작합니다.'}
              placeholder="예: 06776b4c-5941-4d63-96f3-b6ce91331be6"
              value={whifPersonaId}
              onChange={setWhifPersonaId}
              updatedAt={whifPersonaUpdatedAt}
            />

            <CookieField
              label="멜팅 세션 쿠키 (melting.chat) — 끊겼을 때 복구용"
              hint={'서버가 로그인 상태를 영속 브라우저 프로필에 저장해 가져오기마다 재사용을 시도하므로, 활동이 잦으면 따로 갱신하지 않아도 동작할 수 있습니다.\n아래 값은 그 영속 세션이 끊긴 게 감지됐을 때 자동 복구용 "시드"로만 쓰입니다 — 가져오기가 잘 되고 있다면 비워둬도 됩니다.\n가져오기에서 로그인 정보가 빠진다면: 브라우저에서 melting.chat에 로그인한 뒤 개발자도구 → Application/저장소 → Cookies → __Host-melting_session 값을 복사해 붙여넣고 저장하세요.\n⚠️ 참고: 활동과 무관하게 발급 시점 기준으로 30분 뒤 만료되는 구조라면, 영속 세션도 결국 끊기고 이 시드 값을 다시 입력해야 할 수 있습니다 — 직접 운용해보면서 확인해야 하는 부분입니다.'}
              placeholder="__Host-melting_session=eyJ...; __Host-melting_session_exp=..."
              value={meltingCookie}
              onChange={setMeltingCookie}
              updatedAt={meltingUpdatedAt}
            />

            <NicknameField
              label="멜팅 로그인 계정의 페르소나 닉네임"
              hint={'멜팅은 캐릭터 소개 속 "{유저}" 같은 플레이스홀더를 로그인 계정의 페르소나 닉네임으로 실시간 치환해서 보여줍니다.\n그 결과 캡처된 텍스트에 닉네임이 그대로 박혀, 다른 사용자가 가져왔을 때도 그 닉네임이 노출되는 문제가 생깁니다.\n여기에 위 멜팅 계정의 페르소나 닉네임을 입력해두면, 가져오기 시 해당 문자열을 범용 플레이스홀더([유저])로 되돌려 저장합니다.'}
              placeholder="예: 허니"
              value={meltingNickname}
              onChange={setMeltingNickname}
              updatedAt={meltingNicknameUpdatedAt}
            />

            <CookieField
              label="babechat 액세스 토큰 (babechat.ai)"
              hint={'브라우저에서 babechat.ai에 로그인한 뒤, 개발자도구 → Network 탭 → api.babechatapi.com 요청 클릭 → Headers → Authorization 헤더의 "Bearer " 뒤 토큰을 복사해 붙여넣으세요.\n⚠️ 액세스 토큰은 약 3일 만료됩니다. 아래 refresh 토큰을 함께 저장하면 만료 시 서버가 자동 갱신합니다.'}
              placeholder="eyJhbGciOiJIUzI1NiIsImtpZCI6ImJhYmVjaGF0LWF1dGgi..."
              value={babechatAccess}
              onChange={setBabechatAccess}
              updatedAt={babechatAccessUpdatedAt}
            />

            <CookieField
              label="babechat refresh 토큰 (자동 갱신용)"
              hint={'개발자도구 → Application/저장소 → Cookies 또는 Local Storage에서 refresh token(또는 토큰 갱신 요청의 refresh_token 파라미터)을 복사해 붙여넣으세요.\n저장해두면 액세스 토큰 만료 시 서버가 자동으로 새 토큰을 발급받습니다. 비워두면 만료 때마다 위 액세스 토큰을 직접 교체해야 합니다.'}
              placeholder="refresh token"
              value={babechatRefresh}
              onChange={setBabechatRefresh}
              updatedAt={babechatRefreshUpdatedAt}
            />

            <CookieField
              label="Zeta TOKEN (zeta-ai.io)"
              hint={'브라우저에서 zeta-ai.io에 로그인한 뒤, 개발자도구 → Network 탭 → 임의 요청 클릭 → Headers → Cookie 항목에서 TOKEN= 뒤 값(eyJ...)을 복사해 붙여넣으세요.\n또는 Application → Cookies → TOKEN 항목의 값을 직접 복사할 수도 있습니다.\n⚠️ 7일마다 만료됩니다 — 스캔이 안 되면 이 화면에서 TOKEN을 재입력하세요.'}
              placeholder="eyJhbGciOiJIUzM4NCJ9.eyJ1aWQiOi..."
              value={zetaToken}
              onChange={setZetaToken}
              updatedAt={zetaTokenUpdatedAt}
            />

            <CookieField
              label="로판 세션 쿠키 (rofan.ai) — 좋아요 스캔용"
              hint={'rofan.ai 로그인 후 개발자도구 → Application → Cookies → __Secure-next-auth.session-token 값을 복사해 붙여넣으세요.\n토큰 값만 넣어도 되고, 쿠키 전체 문자열을 넣어도 됩니다.'}
              placeholder="__Secure-next-auth.session-token=eyJ... 또는 값만"
              value={rofanCookie}
              onChange={setRofanCookie}
              updatedAt={rofanCookieUpdatedAt}
            />

            <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setTingleOpen(o => !o)}
                style={{ appearance: 'none', border: 'none', background: 'var(--surface-2)', width: '100%', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <span className="tiny" style={{ fontWeight: 700 }}>팅글 인증 (tingle.chat)</span>
                  <span className="tiny muted" style={{ marginLeft: 8 }}>자동 갱신 설정됨 — 수동 변경 필요 시 펼치기</span>
                </div>
                <span className="tiny muted">{tingleOpen ? '▲' : '▼'}</span>
              </button>
              {tingleOpen && (
                <div className="vstack" style={{ gap: 16, padding: 12 }}>
                  <CookieField
                    label="팅글 인증 토큰 (Firebase ID 토큰)"
                    hint={'브라우저에서 tingle.chat에 로그인한 뒤 개발자도구 → Network 탭 → api.tingle.chat 요청 클릭 → Headers → Authorization 헤더의 "Bearer " 뒤 토큰을 복사해 붙여넣으세요.\n\n아래 refresh 토큰 + Firebase API 키가 설정되어 있으면 만료(1시간)마다 서버가 자동 갱신합니다.'}
                    placeholder="eyJhbGciOiJSUzI1NiIsImtpZCI6..."
                    value={tingleToken}
                    onChange={setTingleToken}
                    updatedAt={tingleTokenUpdatedAt}
                  />
                  <CookieField
                    label="팅글 refresh 토큰 (자동 갱신용)"
                    hint={'개발자도구 → Network 탭 → securetoken.googleapis.com/v1/token 요청 → Payload 탭 → refresh_token 값 복사\n\nrefresh 토큰은 로그아웃하거나 Firebase에서 강제 종료하지 않는 한 만료되지 않습니다.'}
                    placeholder="AMf-vBx..."
                    value={tingleRefresh}
                    onChange={setTingleRefresh}
                    updatedAt={tingleRefreshUpdatedAt}
                  />
                  <NicknameField
                    label="팅글 Firebase API 키 (자동 갱신용)"
                    hint={'개발자도구 → Network 탭 → securetoken.googleapis.com/v1/token?key=AIzaSy... → URL의 key= 파라미터 값 복사'}
                    placeholder="AIzaSy..."
                    value={tingleApiKey}
                    onChange={setTingleApiKey}
                    updatedAt={tingleApiKeyUpdatedAt}
                  />
                </div>
              )}
            </div>

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
