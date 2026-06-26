import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { getGlobalConfigValue } from '@/lib/import/capture'

const ZETA_API = 'https://api.zeta-ai.io'
const PAGE_SIZE = 30

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

async function fetchPage(token: string, offset: number): Promise<{ plots: any[]; hasMore: boolean }> {
  const url = `${ZETA_API}/v1/plots/liked?limit=${PAGE_SIZE}&offset=${offset}&orderBy.property=LIKED_AT&orderBy.direction=DESC`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Cookie': `TOKEN=${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  })
  if (res.status === 401 || res.status === 403) throw new Error('Zeta 토큰이 만료되었습니다. 관리자 설정에서 TOKEN을 재입력해주세요.')
  if (!res.ok) throw new Error(`Zeta API 오류 (HTTP ${res.status})`)
  const data = await res.json()
  // 응답 구조: { plots: [...] } 또는 { data: { plots: [...] } } 등
  const plots: any[] = data?.plots ?? data?.data?.plots ?? data?.items ?? data?.data ?? []
  const total: number = data?.totalCount ?? data?.total ?? data?.count ?? plots.length
  return { plots, hasMore: offset + plots.length < total }
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const token = await getGlobalConfigValue('zeta_token')
  if (!token) return NextResponse.json({ error: 'Zeta TOKEN이 설정되어 있지 않습니다. 관리자 설정에서 토큰을 입력해주세요.' }, { status: 400 })

  try {
    const liked: LikedPlot[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { plots, hasMore: more } = await fetchPage(token, offset)
      for (const p of plots) {
        const mapped = mapPlot(p)
        if (mapped) liked.push(mapped)
      }
      hasMore = more && plots.length === PAGE_SIZE
      offset += plots.length
      if (plots.length === 0) break
    }

    return NextResponse.json({ liked, total: liked.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '스캔 실패' }, { status: 500 })
  }
}
