import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { userId: true, rootConversationId: true },
  })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const rootId = conv.rootConversationId ?? params.id

  const all = await prisma.conversation.findMany({
    where: {
      OR: [{ id: rootId }, { rootConversationId: rootId }],
    },
    select: {
      id: true,
      branchDescription: true,
      branchFromMessageId: true,
      rootConversationId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(all.map((c, i) => ({ ...c, version: i + 1 })))
}
