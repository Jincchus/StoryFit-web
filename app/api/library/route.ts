import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conversations = await prisma.conversation.findMany({
    where: { userId, isArchived: true },
    include: {
      characters: { include: { character: { select: { id: true, name: true, avatarUrl: true } } } },
      messages: { where: { isSelected: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      personaCharacter: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(conversations)
}
