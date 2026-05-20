import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signAccessToken, signRefreshToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({ data: { email, passwordHash } })

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id),
    signRefreshToken(user.id),
  ])

  const res = NextResponse.json({ accessToken, userId: user.id }, { status: 201 })
  res.cookies.set('refreshToken', refreshToken, { httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 30 })
  return res
}
