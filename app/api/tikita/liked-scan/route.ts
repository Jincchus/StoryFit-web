import { NextRequest } from 'next/server'
import { runLikedScan, LikedScanError, type LikedItem } from '@/lib/likedScan'
import { getGlobalConfigValue } from '@/lib/import/capture'

// tikita 좋아요 스캔 — 로그인 세션(Supabase access_token)으로 내 좋아요(user_story_likes)를
// 가져온 뒤 story_with_metrics로 표시 메타를 붙인다. 자격증명은 관리자 설정의 tikita_session_token.
const TIKITA_BASE = process.env.TIKITA_API_BASE ?? 'https://auth.tikita.ai'
const TIKITA_ANON = process.env.TIKITA_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ2Fyd3psYmtvdml4dW5mcHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4ODE5NTcsImV4cCI6MjA3MTQ1Nzk1N30.pUYuSpHFRK3fLSii0IBFLVrAoj_wL2PVs8Gt7QLTIts'
const PAGE = 100

function storageUrl(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${TIKITA_BASE}/storage/v1/object/public/${path.replace(/^\/+/, '')}`
}

export async function GET(req: NextRequest) {
  return runLikedScan(req, async () => {
    const token = await getGlobalConfigValue('tikita_session_token')
    if (!token) throw new LikedScanError('tikita 세션 토큰이 설정되어 있지 않습니다. 관리자 설정에서 입력해주세요.', 400)
    const headers = { apikey: TIKITA_ANON, Authorization: `Bearer ${token}`, Accept: 'application/json' }

    // 1) 내 좋아요(user_story_likes) — 최신순으로 story_id를 페이지네이션 수집.
    const storyIds: string[] = []
    let offset = 0
    while (true) {
      const res = await fetch(
        `${TIKITA_BASE}/rest/v1/user_story_likes?select=story_id&order=created_at.desc&limit=${PAGE}&offset=${offset}`,
        { headers },
      )
      if (res.status === 401 || res.status === 403) {
        throw new LikedScanError('tikita 세션이 만료되었습니다. 관리자 설정에서 토큰을 다시 입력해주세요.', 400)
      }
      if (!res.ok) throw new LikedScanError(`tikita API 오류 (HTTP ${res.status})`)
      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) break
      for (const r of rows) if (r?.story_id) storyIds.push(String(r.story_id))
      if (rows.length < PAGE) break
      offset += rows.length
    }
    if (storyIds.length === 0) return { liked: [] }

    // 2) story_with_metrics로 표시 메타 조회(청크 단위). id→row 맵으로 좋아요 순서를 보존.
    const metaById: Record<string, any> = {}
    for (let i = 0; i < storyIds.length; i += PAGE) {
      const chunk = storyIds.slice(i, i + PAGE)
      const res = await fetch(
        `${TIKITA_BASE}/rest/v1/story_with_metrics?id=in.(${chunk.join(',')})&select=id,short_id,title,thumbnail_url,story_thumbnail_url,tags,categories,is_adult`,
        { headers },
      )
      if (!res.ok) continue
      const rows = await res.json()
      if (Array.isArray(rows)) for (const s of rows) if (s?.id) metaById[String(s.id)] = s
    }

    // 3) 좋아요 순서대로 LikedItem 매핑(메타 없는 항목은 스킵).
    const liked: LikedItem[] = []
    for (const id of storyIds) {
      const s = metaById[id]
      if (!s?.short_id) continue
      const tags = Array.from(new Set(
        [...(s.tags ?? []), ...(s.categories ?? [])].map((t: any) => String(t).trim()).filter(Boolean),
      ))
      liked.push({
        id: String(s.short_id),
        name: String(s.title ?? ''),
        coverImageUrl: storageUrl(s.thumbnail_url || s.story_thumbnail_url) || null,
        tags,
        isAdult: !!s.is_adult,
        sourceUrl: `https://tikita.ai/ko/story/${s.short_id}`,
      })
    }
    return { liked }
  })
}
