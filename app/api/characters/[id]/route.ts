import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { PRESET_CHARS } from '@/data/presetCharacters'


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const preset = PRESET_CHARS.find(c => c.id === params.id)
  if (preset) return NextResponse.json(preset)

  const character = await prisma.character.findUnique({
    where: { id: params.id },
    include: { collection: { select: { id: true, title: true } } },
  })
  if (!character) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(character)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const character = await prisma.character.findUnique({ where: { id: params.id } })
  if (!character) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
  if (character.isPreset || character.creatorId !== userId) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  const body = await req.json()
  const updated = await prisma.character.update({ where: { id: params.id }, data: { ...body, isAutoCreated: false } })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const character = await prisma.character.findUnique({ where: { id: params.id } })
  if (!character) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
  if (character.isPreset || character.creatorId !== userId) return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })

  await prisma.$transaction(async (tx) => {
    // 1. Delete character references and character
    await tx.conversationCharacter.deleteMany({ where: { characterId: params.id } })
    await tx.conversation.updateMany({ where: { personaCharacterId: params.id }, data: { personaCharacterId: null } })
    await tx.message.updateMany({ where: { characterId: params.id }, data: { characterId: null } })
    await tx.character.delete({ where: { id: params.id } })

    // 2. Check if collection should be deleted
    if (character.collectionId) {
      const remainingCount = await tx.character.count({
        where: { collectionId: character.collectionId }
      })
      if (remainingCount === 0) {
        // Fetch collection to get conversationId
        const col = await tx.characterCollection.findUnique({
          where: { id: character.collectionId },
          select: { conversationId: true }
        })
        // Delete collection itself (collection-scoped lorebooks cascade)
        await tx.characterCollection.delete({
          where: { id: character.collectionId }
        })
        // Delete associated conversation if exists
        if (col?.conversationId) {
          const exists = await tx.conversation.findUnique({ where: { id: col.conversationId }, select: { id: true } })
          if (exists) {
            await tx.conversation.delete({ where: { id: col.conversationId } })
          }
        }
      }
    }
  })

  return new NextResponse(null, { status: 204 })
}
