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

  let condensed: string
  if (memories.length === 1) {
    condensed = memories[0].summary
  } else {
    const firstChar = conv.characters[0]?.character
    const characterContext = firstChar
      ? [firstChar.tags?.join(', '), firstChar.additionalInfo].filter(Boolean).join('\n')
      : ''
    condensed = await condenseForCoreMemory(memories.map(m => m.summary), conv.coreMemory, characterContext)
  }

  const existing = conv.coreMemory.trim()
  const newCoreMemory = existing ? existing + '\n\n' + condensed : condensed
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
