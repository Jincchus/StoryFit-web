import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { getGlobalConfigValue, isTingleTokenExpired, refreshTingleToken } from '@/lib/import/capture'

const TINGLE_API = 'https://api.tingle.chat'
const PAGE_SIZE = 50
const PARALLEL = 8  // 동시 요청 수

export interface LikedPersona {
  id: string
  name: string
  coverImageUrl: string | null
  tags: string[]
  isAdult: boolean
  sourceUrl: string
}

async function fetchPage(token: string, page: number): Promise<{ results: any[]; totalPages: number }> {
  const res = await fetch(`${TINGLE_API}/personas?page=${page}&limit=${PAGE_SIZE}&order=id`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`API 오류 (page=${page}, status=${res.status})`)
  return res.json()
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  let token = await getGlobalConfigValue('tingle_auth_token')
  if (!token) return NextResponse.json({ error: '팅글 인증 토큰이 없습니다.' }, { status: 400 })

  if (isTingleTokenExpired(token)) {
    try { token = await refreshTingleToken() }
    catch { return NextResponse.json({ error: '팅글 토큰 갱신 실패' }, { status: 400 }) }
  }

  try {
    // 1페이지로 총 페이지 수 확인
    const first = await fetchPage(token, 1)
    const totalPages = first.totalPages
    const liked: LikedPersona[] = []

    const filterLiked = (results: any[]) =>
      results.filter(x => x.isLiked === true).map(x => ({
        id: String(x.id),
        name: x.name ?? '',
        coverImageUrl: x.coverImages?.[0]?.url ?? null,
        tags: (x.tags ?? []).map((t: any) => t.name ?? t),
        isAdult: !!x.isAdult,
        sourceUrl: `https://tingle.chat/chat/characters/${x.id}`,
      }))

    liked.push(...filterLiked(first.results))

    // 나머지 페이지: 배치 단위 병렬 + 배치 사이 딜레이
    for (let batch = 2; batch <= totalPages; batch += PARALLEL) {
      const pages = Array.from({ length: Math.min(PARALLEL, totalPages - batch + 1) }, (_, i) => batch + i)
      const results = await Promise.allSettled(pages.map(p => fetchPage(token, p)))
      for (const r of results) {
        if (r.status === 'fulfilled') liked.push(...filterLiked(r.value.results))
      }

    }

    return NextResponse.json({ liked, total: liked.length, scanned: totalPages })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '스캔 실패' }, { status: 500 })
  }
}
