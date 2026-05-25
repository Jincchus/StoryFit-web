import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest, { params }: { params: { id: string; msgId: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({ where: { id: params.id }, select: { userId: true } })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const msg = await prisma.message.findFirst({
    where: { id: params.msgId, conversationId: params.id },
    select: { id: true, content: true, isStreaming: true },
  })
  if (!msg) return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json(msg)
}
