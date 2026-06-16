import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { compressCoreMemory } from '@/lib/memorySummarization'

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
  if (!conv.coreMemory.trim()) {
    return NextResponse.json({ error: '핵심 메모리가 비어 있습니다.' }, { status: 400 })
  }

  const firstChar = conv.characters[0]?.character
  const characterContext = firstChar
    ? [firstChar.tags?.join(', '), firstChar.additionalInfo].filter(Boolean).join('\n')
    : ''

  const compressed = await compressCoreMemory(conv.coreMemory, characterContext)

  await prisma.conversation.update({
    where: { id: params.id },
    data: { coreMemory: compressed },
  })

  return NextResponse.json({ coreMemory: compressed })
}
