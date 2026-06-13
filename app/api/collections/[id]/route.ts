import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collection = await prisma.characterCollection.findFirst({
    where: { id: params.id, userId },
    include: {
      characters: true,
    },
  })

  if (!collection) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json(collection)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collection = await prisma.characterCollection.findFirst({
    where: { id: params.id, userId },
  })

  if (!collection) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { title } = await req.json()
  if (!title?.trim()) {
    return NextResponse.json({ error: '컬렉션 이름이 필요합니다.' }, { status: 400 })
  }

  const updated = await prisma.characterCollection.update({
    where: { id: params.id },
    data: { title: String(title).trim().slice(0, 200) },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collection = await prisma.characterCollection.findFirst({
    where: { id: params.id, userId },
  })

  if (!collection) {
    return NextResponse.json({ error: '세계관을 찾을 수 없습니다.' }, { status: 404 })
  }

  // Find all characters belonging to this collection
  const chars = await prisma.character.findMany({
    where: { collectionId: params.id },
    select: { id: true }
  })
  const charIds = chars.map(c => c.id)

  await prisma.$transaction(async (tx) => {
    // 1. Delete characters and their references
    if (charIds.length > 0) {
      await tx.conversationCharacter.deleteMany({ where: { characterId: { in: charIds } } })
      await tx.conversation.updateMany({ where: { personaCharacterId: { in: charIds } }, data: { personaCharacterId: null } })
      await tx.message.updateMany({ where: { characterId: { in: charIds } }, data: { characterId: null } })
      await tx.character.deleteMany({ where: { id: { in: charIds } } })
    }

    // 2. Delete the collection itself (collection-scoped lorebooks cascade)
    await tx.characterCollection.delete({
      where: { id: params.id },
    })

    // 3. Delete the associated dummy conversation if exists
    if (collection.conversationId) {
      const exists = await tx.conversation.findUnique({ where: { id: collection.conversationId }, select: { id: true } })
      if (exists) {
        await tx.conversation.delete({ where: { id: collection.conversationId } })
      }
    }
  })

  return new NextResponse(null, { status: 204 })
}
