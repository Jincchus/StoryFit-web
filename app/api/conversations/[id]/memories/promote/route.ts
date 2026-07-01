import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { condenseForCoreMemory } from '@/lib/memorySummarization'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: {
      userId: true,
      coreMemory: true,
      characters: {
        include: { character: { select: { tags: true, additionalInfo: true } } },
        orderBy: { turnOrder: 'asc' },
      },
    },
  })
  if (!conv || conv.userId !== userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const memoryIds = (body as { memoryIds?: unknown })?.memoryIds
  if (!Array.isArray(memoryIds) || memoryIds.length === 0 || memoryIds.length > 20
      || !memoryIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'memoryIds가 필요합니다.' }, { status: 400 })
  }

  const memories = await prisma.memory.findMany({
    where: { id: { in: memoryIds }, conversationId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  if (memories.length === 0) {
    return NextResponse.json({ error: '메모리를 찾을 수 없습니다.' }, { status: 404 })
  }

  let newCoreMemory: string
  if (memories.length === 1) {
    // 단건은 요약을 그대로 이어붙임(통합할 게 없음).
    const existing = conv.coreMemory.trim()
    newCoreMemory = existing ? existing + '\n\n' + memories[0].summary : memories[0].summary
  } else {
    const firstChar = conv.characters[0]?.character
    const characterContext = firstChar
      ? [firstChar.tags?.join(', '), firstChar.additionalInfo].filter(Boolean).join('\n')
      : ''
    // condense가 [기존 핵심 기억]+[신규 요약]을 통합한 완성본을 반환 → 그대로 대체(중복 append 방지).
    newCoreMemory = await condenseForCoreMemory(memories.map(m => m.summary), conv.coreMemory, characterContext)
  }

  const promotedIds = memories.map(m => m.id)

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: params.id },
      data: { coreMemory: newCoreMemory },
    }),
    prisma.memory.updateMany({
      where: { id: { in: promotedIds }, conversationId: params.id },
      data: { promoted: true },
    }),
  ])

  return NextResponse.json({ coreMemory: newCoreMemory, promotedIds })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { userId: true },
  })
  if (!conv || conv.userId !== userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const memoryIds = (body as { memoryIds?: unknown })?.memoryIds
  if (!Array.isArray(memoryIds) || memoryIds.length === 0 || memoryIds.length > 20
      || !memoryIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'memoryIds가 필요합니다.' }, { status: 400 })
  }

  // 승격 해제: 원본 메모리 잠금만 푼다. coreMemory 텍스트는 건드리지 않는다.
  await prisma.memory.updateMany({
    where: { id: { in: memoryIds }, conversationId: params.id },
    data: { promoted: false },
  })

  return NextResponse.json({ unpromotedIds: memoryIds })
}
