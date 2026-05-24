import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signAccessToken, signRefreshToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  if (!user.isApproved) {
    return NextResponse.json({ error: 'PENDING_APPROVAL' }, { status: 403 })
  }

  if (!user.isActive) {
    return NextResponse.json({ error: '계정이 비활성화되었습니다. 관리자에게 문의하세요.' }, { status: 403 })
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id, user.isAdmin),
    signRefreshToken(user.id),
  ])

  const res = NextResponse.json({ userId: user.id, isAdmin: user.isAdmin })
  res.cookies.set('accessToken', accessToken, { httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 })
  res.cookies.set('refreshToken', refreshToken, { httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 30 })
  return res
}
