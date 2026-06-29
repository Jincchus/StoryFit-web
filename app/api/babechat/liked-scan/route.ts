import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLikedScan, LikedScanError, type LikedItem } from '@/lib/likedScan'
import { refreshAccessToken } from '@/lib/import/babechat'

// babechat 좋아요 스캔. api.babechatapi.com/ko/api/characters/like (Bearer, offset 페이지네이션).
// 응답: [{ id, characterId, name, mainImage, tags[], isAdult, ... }] (배열 직접 반환)
const API = 'https://api.babechatapi.com/ko/api'
const PAGE = 50

function fetchPage(token: string, offset: number): Promise<Response> {
  return fetch(`${API}/characters/like?sort=latest&limit=${PAGE}&offset=${offset}&isSafetyEnabled=true`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
}

export async function GET(req: NextRequest) {
  return runLikedScan(req, async () => {
    const cfg = await prisma.globalConfig.findUnique({ where: { key: 'babechat_access_token' } })
    let token = cfg?.value?.trim() ?? ''
    if (!token) throw new LikedScanError('babechat 토큰이 설정되어 있지 않습니다. 관리자 설정에서 입력해주세요.', 400)

    const liked: LikedItem[] = []
    let offset = 0
    while (true) {
      let res = await fetchPage(token, offset)
      if (res.status === 401 || res.status === 403) {
        token = await refreshAccessToken()
        res = await fetchPage(token, offset)
      }
      if (!res.ok) throw new LikedScanError(`babechat API 오류 (HTTP ${res.status})`)
      const arr: any[] = await res.json()
      if (!Array.isArray(arr) || arr.length === 0) break
      for (const x of arr) {
        const id = String(x.id ?? x.characterId ?? '')
        if (!id) continue
        liked.push({
          id,
          name: String(x.name ?? ''),
          coverImageUrl: x.mainImage ?? null,
          tags: Array.isArray(x.tags) ? x.tags : [],
          isAdult: !!x.isAdult,
          sourceUrl: `https://babechat.ai/character/u/${id}/profile`,
        })
      }
      if (arr.length < PAGE) break
      offset += PAGE
    }
    return { liked }
  })
}
