import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const characters = await prisma.character.findMany({
    where: { OR: [{ isPreset: true }, { creatorId: userId }] },
    orderBy: [{ isPreset: 'desc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json(characters)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })
  }

  const character = await prisma.character.create({
    data: {
      name: body.name,
      gender: body.gender ?? '',
      tags: body.tags ?? [],
      additionalInfo: body.additionalInfo ?? '',
      exampleDialogues: body.exampleDialogues ?? '',
      avatarUrl: body.avatarUrl,
      safetyLevel: body.safetyLevel ?? 'standard',
      temperature: body.temperature ?? 0.9,
      frequencyPenalty: body.frequencyPenalty ?? 0.3,
      presencePenalty: body.presencePenalty ?? 0.3,
      defaultAI: body.defaultAI ?? 'gemini',
      creatorId: userId,
    },
  })
  return NextResponse.json(character, { status: 201 })
}
