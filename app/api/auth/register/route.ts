import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })

  const passwordHash = await bcrypt.hash(password, 12)

  const existingCount = await prisma.user.count()
  const isFirstUser = existingCount === 0

  await prisma.user.create({
    data: { email, passwordHash, isApproved: isFirstUser },
  })

  if (isFirstUser) {
    return NextResponse.json({ pending: false }, { status: 201 })
  }
  return NextResponse.json({ pending: true }, { status: 201 })
}
