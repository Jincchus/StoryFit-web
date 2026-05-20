import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

async function authenticate(req: NextRequest) {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id, isSelected: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(messages)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { messageId } = await req.json()
  if (!messageId) return NextResponse.json({ error: 'messageId가 필요합니다.' }, { status: 400 })

  await prisma.message.delete({ where: { id: messageId } })
  return new NextResponse(null, { status: 204 })
}
