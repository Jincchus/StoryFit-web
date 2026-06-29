import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLikedScan, LikedScanError, type LikedItem } from '@/lib/likedScan'

// whif 좋아요 스캔. 게이트웨이 Connect-RPC(POST). whif_session_cookie(JWT)를 Bearer로 사용.
// 캐릭터 응답: { characters: [{ id, name, avatarUrl, publicData... }] }
// 세계관 응답: { universes: [...] }  (※ 빈 결과 검증만 됨 — 필드명은 추정, 실데이터로 보정 필요)
const GW = 'https://whif-gateway-298335711332.asia-northeast3.run.app'

async function call(token: string, method: string): Promise<any> {
  const res = await fetch(`${GW}/whif.bff.v1.${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' },
    body: '{}',
  })
  if (res.status === 401 || res.status === 403) throw new LikedScanError('whif 세션이 만료되었습니다. 관리자 설정에서 토큰을 재입력해주세요.', 400)
  if (!res.ok) throw new LikedScanError(`whif API 오류 (HTTP ${res.status})`)
  return res.json()
}

export async function GET(req: NextRequest) {
  return runLikedScan(req, async () => {
    const cfg = await prisma.globalConfig.findUnique({ where: { key: 'whif_session_cookie' } })
    const token = (cfg?.value ?? '').trim().replace(/^Bearer\s+/i, '')
    if (!token) throw new LikedScanError('whif 세션 토큰이 설정되어 있지 않습니다. 관리자 설정에서 입력해주세요.', 400)

    const liked: LikedItem[] = []

    const chars = await call(token, 'CharacterLikeService/GetLikedCharacters')
    for (const x of (chars?.characters ?? [])) {
      const id = String(x?.id ?? '')
      if (!id) continue
      liked.push({
        id,
        name: String(x?.name ?? ''),
        coverImageUrl: x?.avatarUrl ?? null,
        tags: Array.isArray(x?.tags) ? x.tags : [],
        sourceUrl: `https://whif.io/characters/${id}`,
      })
    }

    const unis = await call(token, 'UniverseLikeService/ListUserLikedUniverses')
    for (const x of (unis?.universes ?? unis?.likedUniverses ?? [])) {
      const id = String(x?.id ?? '')
      if (!id) continue
      liked.push({
        id,
        name: String(x?.name ?? x?.title ?? ''),
        coverImageUrl: x?.avatarUrl ?? x?.coverUrl ?? x?.thumbnailUrl ?? null,
        tags: Array.isArray(x?.tags) ? x.tags : [],
        sourceUrl: `https://whif.io/universes/${id}`,
      })
    }

    return {
      liked,
      extra: { characters: (chars?.characters ?? []).length, universes: (unis?.universes ?? unis?.likedUniverses ?? []).length },
    }
  })
}
