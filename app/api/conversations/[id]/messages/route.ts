import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { rollbackInventoryDelta, rollbackStatsDelta } from '@/lib/storyEval'
import type { InventoryItem, StatEntry } from '@/types'


const PAGE_SIZE = 50

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({ where: { id: params.id }, select: { userId: true } })
  if (!conv || conv.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  // cursor: 이 메시지 id 이전 것들을 로드 (없으면 가장 최근 PAGE_SIZE개)
  const cursor = req.nextUrl.searchParams.get('cursor')

  // sibling 계산을 위해 전체 메시지 id+parentId+isSelected만 가져옴 (lightweight)
  const allMeta = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, parentId: true, isSelected: true, isStreaming: true, createdAt: true },
  })

  const byParent = new Map<string, typeof allMeta>()
  for (const m of allMeta) {
    const key = m.parentId ?? '__root__'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(m)
  }

  const selectedAll = allMeta.filter(m => m.isSelected && !m.isStreaming)

  // 커서 위치 찾기 → 커서 이전(exclusive) PAGE_SIZE개
  let pageSlice: typeof selectedAll
  let hasMore = false
  if (cursor) {
    const cursorIdx = selectedAll.findIndex(m => m.id === cursor)
    const end = cursorIdx === -1 ? selectedAll.length : cursorIdx
    const start = Math.max(0, end - PAGE_SIZE)
    pageSlice = selectedAll.slice(start, end)
    hasMore = start > 0
  } else {
    const start = Math.max(0, selectedAll.length - PAGE_SIZE)
    pageSlice = selectedAll.slice(start)
    hasMore = start > 0
  }

  // 실제 content 포함 전체 필드는 페이지 메시지만 조회
  const pageIds = new Set(pageSlice.map(m => m.id))
  const fullMessages = await prisma.message.findMany({
    where: { id: { in: Array.from(pageIds) } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    messages: fullMessages.map(m => {
      const siblings = byParent.get(m.parentId ?? '__root__') ?? [m]
      const branchIndex = siblings.findIndex(s => s.id === m.id) + 1
      return { ...m, branchCount: siblings.length, branchIndex, siblingIds: siblings.map(s => s.id) }
    }),
    hasMore,
    oldestId: pageSlice[0]?.id ?? null,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const convCheck = await prisma.conversation.findUnique({ where: { id: params.id }, select: { userId: true } })
  if (!convCheck || convCheck.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const body = await req.json()

  // 북마크 토글
  if (body.messageId && body.bookmarked !== undefined) {
    const msg = await prisma.message.findUnique({ where: { id: body.messageId }, select: { conversationId: true } })
    if (!msg || msg.conversationId !== params.id) {
      return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 })
    }
    const updated = await prisma.message.update({
      where: { id: body.messageId },
      data: { bookmarked: !!body.bookmarked },
    })
    return NextResponse.json(updated)
  }

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

  const convCheck = await prisma.conversation.findUnique({ where: { id: params.id }, select: { userId: true } })
  if (!convCheck || convCheck.userId !== userId) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const { messageId } = await req.json()
  if (!messageId) return NextResponse.json({ error: 'messageId가 필요합니다.' }, { status: 400 })

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, role: true, inventoryDelta: true, statsDelta: true },
  })
  if (!msg || msg.conversationId !== params.id) return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 })

  if (msg.role === 'assistant' && (msg.inventoryDelta || msg.statsDelta)) {
    const conv = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: { inventory: true, statsConfig: true, inventoryEnabled: true, statsEnabled: true },
    })
    if (conv) {
      if (conv.inventoryEnabled && msg.inventoryDelta && Array.isArray(conv.inventory)) {
        await rollbackInventoryDelta(params.id, msg.inventoryDelta as any, conv.inventory as InventoryItem[]).catch(err => console.error('[messages] 인벤토리 롤백 실패:', err))
      }
      if (conv.statsEnabled && msg.statsDelta && Array.isArray(conv.statsConfig)) {
        await rollbackStatsDelta(params.id, msg.statsDelta as any, conv.statsConfig as StatEntry[]).catch(err => console.error('[messages] 스탯 롤백 실패:', err))
      }
    }
  }

  await prisma.message.delete({ where: { id: messageId } })
  return new NextResponse(null, { status: 204 })
}
