import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { getGlobalConfigValue } from '@/lib/import/capture'

const MELTING_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export interface LikedCharacter {
  id: string
  name: string
  coverImageUrl: string | null
  tags: string[]
  isAdult: boolean
  sourceUrl: string
}

// 응답 구조: { json: { friends: [{ uid, bot: { id, name, profileImagePath, ... } }], rawCount, pageSize } }
// limit 파라미터는 무시되고 서버 기본값(50)으로 전체 목록을 한 번에 반환함
function mapItem(item: any): LikedCharacter | null {
  const bot = item?.bot
  const id = String(bot?.id ?? '').trim()
  if (!id || bot?.deletedAt) return null
  const profileImagePath = bot?.profileImagePath
  const coverImageUrl = profileImagePath
    ? `https://image-gen.melting.chat/public_images/${profileImagePath}?s=lg`
    : null
  return {
    id,
    name: String(bot?.name ?? ''),
    coverImageUrl,
    tags: [],
    isAdult: false,
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
    const res = await fetch('https://melting.chat/api/friends', {
      headers: {
        'User-Agent': MELTING_UA,
        Accept: 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Cookie: sessionCookie,
      },
    })
    if (res.status === 401 || res.status === 403) {
      throw new Error('멜팅 세션이 만료되었습니다. 관리자 설정에서 쿠키를 재입력해주세요.')
    }
    if (!res.ok) throw new Error(`멜팅 API 오류 (HTTP ${res.status})`)

    const payload = await res.json()
    const data = payload?.json ?? payload
    const items: any[] = Array.isArray(data?.friends) ? data.friends : []

    const liked: LikedCharacter[] = []
    for (const item of items) {
      const mapped = mapItem(item)
      if (mapped) liked.push(mapped)
    }

    return NextResponse.json({ liked, total: liked.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '스캔 실패' }, { status: 500 })
  }
}
