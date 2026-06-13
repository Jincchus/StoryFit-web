import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { token } = await req.json()
  if (typeof token !== 'string' || !/^ExponentPushToken\[[\w-]+\]$/.test(token)) {
    return NextResponse.json({ error: '유효하지 않은 푸시 토큰입니다.' }, { status: 400 })
  }

  await prisma.pushToken.upsert({
    where: { token },
    update: { userId },
    create: { token, userId },
  })

  return NextResponse.json({ ok: true })
}
