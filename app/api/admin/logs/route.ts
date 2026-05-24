import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit = 50

  const [logs, total] = await Promise.all([
    prisma.adminLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminLog.count(),
  ])

  const adminIds = Array.from(new Set(logs.map(l => l.adminId)))
  const admins = await prisma.user.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, email: true },
  })
  const adminMap = Object.fromEntries(admins.map(a => [a.id, a.email]))

  return NextResponse.json({
    logs: logs.map(l => ({ ...l, adminEmail: adminMap[l.adminId] ?? l.adminId })),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}
