import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } },
      messages: { orderBy: { createdAt: 'asc' }, where: { isSelected: true } },
      personaCharacter: { select: { id: true, name: true, avatarUrl: true, tags: true, additionalInfo: true } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(conv)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const allowed = ['title', 'currentAI', 'personaCharacterId', 'coreMemory', 'statusTimeline', 'scenarioDescription', 'isPinned', 'isArchived']
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))

  const conv = await prisma.conversation.updateMany({ where: { id: params.id, userId }, data })
  if (conv.count === 0) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const result = await prisma.conversation.deleteMany({ where: { id: params.id, userId } })
  if (result.count === 0) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
