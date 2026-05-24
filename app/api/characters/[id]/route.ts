import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { PRESET_CHARS } from '@/data/presetCharacters'


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const preset = PRESET_CHARS.find(c => c.id === params.id)
  if (preset) return NextResponse.json(preset)

  const character = await prisma.character.findUnique({ where: { id: params.id } })
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
  const updated = await prisma.character.update({ where: { id: params.id }, data: body })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const character = await prisma.character.findUnique({ where: { id: params.id } })
  if (!character) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
  if (character.isPreset || character.creatorId !== userId) return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })

  await prisma.$transaction([
    prisma.conversationCharacter.deleteMany({ where: { characterId: params.id } }),
    prisma.conversation.updateMany({ where: { personaCharacterId: params.id }, data: { personaCharacterId: null } }),
    prisma.message.updateMany({ where: { characterId: params.id }, data: { characterId: null } }),
    prisma.lorebook.updateMany({ where: { characterId: params.id }, data: { characterId: null } }),
    prisma.character.delete({ where: { id: params.id } }),
  ])
  return new NextResponse(null, { status: 204 })
}
