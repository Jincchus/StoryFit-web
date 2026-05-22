import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccessToken, getTokenFromHeader } from '@/lib/auth'

async function authenticate(req: NextRequest) {
  try { return await verifyAccessToken(getTokenFromHeader(req.headers.get('authorization')) ?? '') } catch { return null }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const allMessages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: 'asc' },
  })

  // group by parentId to compute sibling counts
  const byParent = new Map<string, typeof allMessages>()
  for (const m of allMessages) {
    const key = m.parentId ?? '__root__'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(m)
  }

  const selected = allMessages.filter(m => m.isSelected)
  return NextResponse.json(selected.map(m => {
    const siblings = byParent.get(m.parentId ?? '__root__') ?? [m]
    const branchIndex = siblings.findIndex(s => s.id === m.id) + 1
    return { ...m, branchCount: siblings.length, branchIndex }
  }))
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()

  // content-only edit (저장만)
  if (body.messageId && body.content !== undefined) {
    const msg = await prisma.message.findUnique({ where: { id: body.messageId } })
    if (!msg || msg.conversationId !== params.id) {
      return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 })
    }
    const updated = await prisma.message.update({
      where: { id: body.messageId },
      data: { content: body.content },
    })
    return NextResponse.json(updated)
  }

  // branch switch
  const { targetMessageId } = body
  if (!targetMessageId) return NextResponse.json({ error: 'targetMessageId가 필요합니다.' }, { status: 400 })

  const target = await prisma.message.findUnique({ where: { id: targetMessageId } })
  if (!target || target.conversationId !== params.id) {
    return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 })
  }

  const siblings = await prisma.message.findMany({
    where: { conversationId: params.id, parentId: target.parentId },
  })

  await prisma.$transaction([
    ...siblings.map(s => prisma.message.update({ where: { id: s.id }, data: { isSelected: false } })),
    prisma.message.update({ where: { id: targetMessageId }, data: { isSelected: true } }),
  ])

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { messageId } = await req.json()
  if (!messageId) return NextResponse.json({ error: 'messageId가 필요합니다.' }, { status: 400 })

  await prisma.message.delete({ where: { id: messageId } })
  return new NextResponse(null, { status: 204 })
}
