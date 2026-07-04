import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { getValidZetaToken } from '@/lib/import/capture'

const ZETA_API = 'https://api.zeta-ai.io'
const PAGE_SIZE = 200

export interface LikedPlot {
  id: string
  name: string
  coverImageUrl: string | null
  tags: string[]
  sourceUrl: string
}

function mapPlot(p: any): LikedPlot | null {
  const id = String(p?.id ?? '').trim()
  if (!id) return null
  return {
    id,
    name: String(p?.title ?? p?.name ?? ''),
    coverImageUrl: p?.coverImageUrl ?? p?.thumbnailUrl ?? null,
    tags: Array.isArray(p?.tags) ? p.tags.map((t: any) => t?.name ?? t).filter(Boolean) : [],
    sourceUrl: `https://zeta-ai.io/ko/plots/${id}/profile`,
  }
}

async function fetchPage(token: string, cursor: string | null): Promise<{ plots: any[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    'orderBy.property': 'LIKED_AT',
    'orderBy.direction': 'DESC',
  })
  if (cursor) params.set('cursor', cursor)
  const res = await fetch(`${ZETA_API}/v1/plots/liked?${params.toString()}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Authorization': `Bearer ${token}`,
      'Cookie': `TOKEN=${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  })
  if (res.status === 401 || res.status === 403) throw new Error('Zeta 토큰이 만료되었습니다. 관리자 설정에서 TOKEN과 REFRESH_TOKEN을 재입력해주세요.')
  if (!res.ok) throw new Error(`Zeta API 오류 (HTTP ${res.status})`)
  const data = await res.json()
  // 응답 구조: { plots: [...], nextCursor: number|null } — offset 파라미터는 서버가 무시하고
  // 항상 1페이지를 반환한다(2026-07-04 실측). 실제 페이지네이션은 nextCursor로만 진행된다.
  const plots: any[] = data?.plots ?? data?.data?.plots ?? data?.items ?? data?.data ?? []
  const nextCursor = data?.nextCursor != null ? String(data.nextCursor) : null
  return { plots, nextCursor }
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const token = await getValidZetaToken()
  if (!token) return NextResponse.json({ error: 'Zeta TOKEN이 설정되어 있지 않습니다. 관리자 설정에서 토큰을 입력해주세요.' }, { status: 400 })

  try {
    const liked: LikedPlot[] = []
    let cursor: string | null = null

    while (true) {
      const { plots, nextCursor }: { plots: any[]; nextCursor: string | null } = await fetchPage(token, cursor)
      for (const p of plots) {
        const mapped = mapPlot(p)
        if (mapped) liked.push(mapped)
      }
      if (plots.length === 0 || !nextCursor) break
      cursor = nextCursor
    }

    return NextResponse.json({ liked, total: liked.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '스캔 실패' }, { status: 500 })
  }
}
