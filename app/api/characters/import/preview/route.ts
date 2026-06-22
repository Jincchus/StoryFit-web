import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { matchesHost, captureTingleRaw } from '@/lib/import/capture'

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { url } = await req.json()
  if (!url?.trim()) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })

  if (!matchesHost(url, 'tingle.chat')) {
    return NextResponse.json({ error: '현재 팅글(tingle.chat)만 미리보기를 지원합니다.' }, { status: 400 })
  }

  try {
    const raw = await captureTingleRaw(url.trim())
    return NextResponse.json(raw)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '미리보기 실패' }, { status: 400 })
  }
}
