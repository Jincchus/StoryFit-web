import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLikedScan, LikedScanError, type LikedItem } from '@/lib/likedScan'

// rofan 좋아요 스캔. NextAuth 세션 쿠키(__Secure-next-auth.session-token)로 인증.
// 1) /api/auth/session 으로 userId 획득 → 2) POST /api/bot/GetFavoritesList { userId }.
// 응답: { botList: [{ bot_id, char(이름), char_image, ... }] }
const SITE = 'https://rofan.ai'

export async function GET(req: NextRequest) {
  return runLikedScan(req, async () => {
    const cfg = await prisma.globalConfig.findUnique({ where: { key: 'rofan_session_cookie' } })
    const raw = (cfg?.value ?? '').trim()
    if (!raw) throw new LikedScanError('rofan 세션 쿠키가 설정되어 있지 않습니다. 관리자 설정에서 입력해주세요.', 400)
    // 저장값이 토큰만이면 쿠키명 보강, 전체 쿠키면 그대로.
    const cookie = raw.includes('=') ? raw : `__Secure-next-auth.session-token=${raw}`

    const sess = await fetch(`${SITE}/api/auth/session`, { headers: { Cookie: cookie, Accept: 'application/json' } })
    if (!sess.ok) throw new LikedScanError('rofan 세션 조회 실패.', 400)
    const sessData = await sess.json().catch(() => ({}))
    const userId = sessData?.user?.id
    if (!userId) throw new LikedScanError('rofan 세션이 만료되었습니다. 관리자 설정에서 쿠키를 재입력해주세요.', 400)

    const res = await fetch(`${SITE}/api/bot/GetFavoritesList`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) throw new LikedScanError(`rofan API 오류 (HTTP ${res.status})`)
    const data = await res.json()

    const liked: LikedItem[] = []
    for (const x of (data?.botList ?? [])) {
      const id = String(x?.bot_id ?? '')
      if (!id) continue
      liked.push({
        id,
        name: String(x?.char ?? ''),
        coverImageUrl: x?.char_image ?? null,
        tags: Array.isArray(x?.tags) ? x.tags : [],
        sourceUrl: `${SITE}/character/${id}`,
      })
    }
    return { liked }
  })
}
