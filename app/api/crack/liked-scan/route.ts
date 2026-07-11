import { NextRequest } from 'next/server'
import { runLikedScan, LikedScanError, type LikedItem } from '@/lib/likedScan'
import { crackApiGetJson, mapCrackLikedStory } from '@/lib/import/crack'

// 크랙 좋아요 스토리 스캔. crack_session_cookie로 plain fetch(CF 통과), 커서 페이지네이션(≤50p).
export async function GET(req: NextRequest) {
  return runLikedScan(req, async () => {
    const liked: LikedItem[] = []
    const seen = new Set<string>()
    let cursor: string | null = null
    for (let page = 0; page < 50; page++) {
      const q = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      let data: any
      try {
        data = await crackApiGetJson(`/crack-api/stories/me/liked?limit=30${q}`)
      } catch (e: any) {
        throw new LikedScanError(e?.message ?? '크랙 좋아요 스캔 실패', 400)
      }
      const stories = data?.data?.stories ?? []
      for (const s of stories) {
        const item = mapCrackLikedStory(s)
        if (item.id && !seen.has(item.id)) { seen.add(item.id); liked.push(item) }
      }
      cursor = data?.data?.nextCursor ?? null
      if (!cursor) break
      await new Promise(r => setTimeout(r, 1000)) // 페이지 사이 완만한 딜레이
    }
    return { liked, extra: { total: liked.length } }
  })
}
