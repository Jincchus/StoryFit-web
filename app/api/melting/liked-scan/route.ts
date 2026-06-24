import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { getGlobalConfigValue } from '@/lib/import/capture'

const MELTING_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const PAGE_SIZE = 50
const PARALLEL = 6

export interface LikedCharacter {
  id: string
  name: string
  coverImageUrl: string | null
  tags: string[]
  isAdult: boolean
  sourceUrl: string
}

async function fetchPage(cookie: string, page: number): Promise<{ items: any[]; totalPages: number }> {
  const res = await fetch(`https://melting.chat/api/friends?page=${page}&limit=${PAGE_SIZE}`, {
    headers: {
      'User-Agent': MELTING_UA,
      Accept: 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Cookie: cookie,
    },
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('멜팅 세션이 만료되었습니다. 관리자 설정에서 쿠키를 재입력해주세요.')
  }
  if (!res.ok) throw new Error(`멜팅 API 오류 (HTTP ${res.status})`)

  const payload = await res.json()
  // tRPC json 래핑 또는 plain 배열 모두 대응
  const data = payload?.json ?? payload
  const items: any[] = Array.isArray(data)
    ? data
    : (data?.bots ?? data?.friends ?? data?.results ?? data?.items ?? [])
  const totalPages: number = Number(data?.totalPages ?? data?.total_pages ?? 1)

  return { items, totalPages }
}

function mapItem(item: any): LikedCharacter | null {
  const bot = item?.bot ?? item
  const id = String(bot?.id ?? '').trim()
  if (!id) return null
  const profileImagePath = bot?.profileImagePath
  const coverImageUrl = profileImagePath
    ? `https://image-gen.melting.chat/public_images/${profileImagePath}?s=lg`
    : null
  const nativeTags = Array.isArray(bot?.tags) ? bot.tags.map((t: any) => String(t).trim()) : []
  return {
    id,
    name: String(bot?.name ?? ''),
    coverImageUrl,
    tags: nativeTags,
    isAdult: !!bot?.isSensitive,
    sourceUrl: `https://melting.chat/characters/${id}`,
  }
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const sessionCookie = await getGlobalConfigValue('melting_session_cookie')
  if (!sessionCookie) {
    return NextResponse.json(
      { error: '멜팅 세션 쿠키가 설정되어 있지 않습니다. 관리자 설정에서 쿠키를 입력해주세요.' },
      { status: 400 }
    )
  }

  try {
    const first = await fetchPage(sessionCookie, 1)
    const totalPages = first.totalPages
    const liked: LikedCharacter[] = []

    for (const item of first.items) {
      const mapped = mapItem(item)
      if (mapped) liked.push(mapped)
    }

    for (let batch = 2; batch <= totalPages; batch += PARALLEL) {
      const pages = Array.from(
        { length: Math.min(PARALLEL, totalPages - batch + 1) },
        (_, i) => batch + i
      )
      const results = await Promise.allSettled(pages.map(p => fetchPage(sessionCookie, p)))
      for (const r of results) {
        if (r.status === 'fulfilled') {
          for (const item of r.value.items) {
            const mapped = mapItem(item)
            if (mapped) liked.push(mapped)
          }
        }
      }
    }

    return NextResponse.json({ liked, total: liked.length, scanned: totalPages })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '스캔 실패' }, { status: 500 })
  }
}
