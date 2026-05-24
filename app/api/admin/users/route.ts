import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, displayName: true, isAdmin: true, isActive: true, isApproved: true,
      _count: { select: { conversations: true } },
    },
    orderBy: [{ isApproved: 'asc' }, { email: 'asc' }],
    take: 500,
  })
  return NextResponse.json(users)
}
