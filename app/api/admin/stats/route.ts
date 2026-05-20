import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [users, conversations, messages, newUsers] = await Promise.all([
    prisma.user.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.user.count({ where: { conversations: { some: {} } } }),
  ])

  const recentConvs = await prisma.conversation.count({ where: { createdAt: { gte: since7d } } })

  return NextResponse.json({ users, conversations, messages, recentConvs })
}
