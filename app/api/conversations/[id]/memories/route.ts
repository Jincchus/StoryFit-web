import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'


async function verifyOwnership(convId: string, userId: string): Promise<boolean> {
  const conv = await prisma.conversation.findUnique({ where: { id: convId }, select: { userId: true } })
  return conv?.userId === userId
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  if (!await verifyOwnership(params.id, userId)) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const memories = await prisma.memory.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(memories)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  if (!await verifyOwnership(params.id, userId)) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const { memoryId } = await req.json()
  if (!memoryId) return NextResponse.json({ error: 'memoryId가 필요합니다.' }, { status: 400 })

  await prisma.memory.delete({ where: { id: memoryId, conversationId: params.id } })
  return NextResponse.json({ ok: true })
}
