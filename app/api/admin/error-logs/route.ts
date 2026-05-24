import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  if (!user?.isAdmin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '100'), 500)
  const errorType = req.nextUrl.searchParams.get('errorType') ?? ''
  const provider = req.nextUrl.searchParams.get('provider') ?? ''

  const logs = await prisma.aiErrorLog.findMany({
    where: {
      ...(errorType ? { errorType } : {}),
      ...(provider ? { provider } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(logs)
}

export async function DELETE(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  if (!user?.isAdmin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  await prisma.aiErrorLog.deleteMany({})
  return NextResponse.json({ ok: true })
}
