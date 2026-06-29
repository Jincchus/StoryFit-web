import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'

// 좋아요 스캔 공통 타입 — 외부 센터 사이트의 "좋아요/즐겨찾기" 목록 1건.
export interface LikedItem {
  id: string
  name: string
  coverImageUrl: string | null
  tags: string[]
  isAdult?: boolean
  sourceUrl: string
}

export interface LikedScanResult {
  liked: LikedItem[]
  // 일부 센터는 추가 메타를 함께 반환(예: tingle의 scanned 페이지 수).
  extra?: Record<string, unknown>
}

// 좋아요 스캔 라우트 공통 래퍼: 인증 + 표준 응답/에러 형태 통일.
// 센터별 라우트는 scan 어댑터(자격증명 로딩 + 외부 API 호출 + LikedItem 매핑)만 구현하면 된다.
//   export async function GET(req: NextRequest) {
//     return runLikedScan(req, async () => {
//       const cred = await getGlobalConfigValue('<center>_session_cookie')
//       if (!cred) throw new LikedScanError('쿠키가 설정되어 있지 않습니다.', 400)
//       ... fetch ... map ...
//       return { liked }
//     })
//   }
export class LikedScanError extends Error {
  status: number
  constructor(message: string, status = 500) { super(message); this.status = status }
}

export async function runLikedScan(
  req: NextRequest,
  scan: () => Promise<LikedScanResult>,
): Promise<NextResponse> {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    const { liked, extra } = await scan()
    return NextResponse.json({ liked, total: liked.length, ...(extra ?? {}) })
  } catch (e: any) {
    const status = e instanceof LikedScanError ? e.status : 500
    return NextResponse.json({ error: e?.message ?? '스캔 실패' }, { status })
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * 신규 센터 좋아요 스캔 어댑터 — 밑작업(주석 보관). 세션/쿠키 확보 시 주석 해제 + 엔드포인트 확정.
 *
 * 자격증명/엔드포인트 현황:
 *  - babechat : 자격증명 이미 있음(GlobalConfig: babechat_access_token / babechat_refresh_token).
 *               → tingle처럼 Bearer 토큰 방식 추정. 좋아요 API 엔드포인트 확인 필요.
 *  - whif     : 자격증명 이미 있음(GlobalConfig: whif_session_cookie, captureWhif도 동일 쿠키 사용).
 *               → melting처럼 Cookie 방식. whif.io 즐겨찾기 API 확인 필요.
 *  - loveydovey / tikita / rofan / chub : 현재 공개 URL 메타데이터 파싱만(자격증명 없음).
 *               → 좋아요 스캔하려면 (1) 로그인 세션 쿠키/토큰을 admin/import-cookies에 추가 저장,
 *                 (2) 각 사이트 즐겨찾기 API 엔드포인트+응답구조 확인 후 매퍼 작성.
 *
 * 참고 구현(작동 중): app/api/{melting,tingle,zeta}/liked-scan/route.ts
 *  - melting: getGlobalConfigValue('melting_session_cookie') → fetch melting.chat/api/friends (Cookie)
 *  - tingle : getGlobalConfigValue('tingle_auth_token')(+refresh) → api.tingle.chat/personas?page=… (Bearer, isLiked 필터)
 *  - zeta   : getGlobalConfigValue('zeta_token') → api.zeta-ai.io/v1/plots/liked?… (Cookie: TOKEN=…)
 *
 * 예시(babechat, Bearer 토큰 추정) — 실제 엔드포인트/응답구조 확인 후 채울 것:
 *
 *   import { getGlobalConfigValue } from '@/lib/import/capture'
 *   export async function scanBabechatLiked(): Promise<LikedScanResult> {
 *     const token = await getGlobalConfigValue('babechat_access_token')
 *     if (!token) throw new LikedScanError('babechat 토큰이 설정되어 있지 않습니다.', 400)
 *     const res = await fetch('https://api.babechat.ai/<TODO: 좋아요 엔드포인트>', {
 *       headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
 *     })
 *     if (res.status === 401 || res.status === 403) throw new LikedScanError('babechat 토큰이 만료되었습니다.', 400)
 *     if (!res.ok) throw new LikedScanError(`babechat API 오류 (HTTP ${res.status})`)
 *     const data = await res.json()
 *     const items: any[] = data?.<TODO> ?? []
 *     const liked: LikedItem[] = items.map(x => ({
 *       id: String(x.id),
 *       name: x.name ?? '',
 *       coverImageUrl: x.<TODO: 이미지> ?? null,
 *       tags: (x.tags ?? []).map((t: any) => t?.name ?? t),
 *       isAdult: !!x.isAdult,
 *       sourceUrl: `https://babechat.ai/<TODO: 경로>/${x.id}`,
 *     }))
 *     return { liked }
 *   }
 *
 * 예시(whif, Cookie 추정):
 *   export async function scanWhifLiked(): Promise<LikedScanResult> {
 *     const cookie = await getGlobalConfigValue('whif_session_cookie')
 *     if (!cookie) throw new LikedScanError('whif 세션 쿠키가 설정되어 있지 않습니다.', 400)
 *     const res = await fetch('https://whif.io/<TODO: 즐겨찾기 엔드포인트>', {
 *       headers: { Cookie: cookie, Accept: 'application/json' },
 *     })
 *     ... 매핑 ...
 *   }
 * ──────────────────────────────────────────────────────────────────────── */
