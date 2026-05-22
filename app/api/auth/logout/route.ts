import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('accessToken', '', { httpOnly: true, sameSite: 'strict', maxAge: 0, path: '/' })
  res.cookies.set('refreshToken', '', { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0, path: '/' })
  return res
}
