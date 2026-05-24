import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, isAdmin: true, isActive: true, isApproved: true,
      _count: { select: { conversations: true } },
    },
    orderBy: [{ isApproved: 'asc' }, { email: 'asc' }],
  })
  return NextResponse.json(users)
}
