import { NextRequest, NextResponse } from 'next/server'
import { verifyRefreshToken, signAccessToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refreshToken')?.value
  if (!refreshToken) return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })

  try {
    const userId = await verifyRefreshToken(refreshToken)
    const accessToken = await signAccessToken(userId)
    const res = NextResponse.json({ ok: true })
    res.cookies.set('accessToken', accessToken, { httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 })
    return res
  } catch {
    return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 })
  }
}
