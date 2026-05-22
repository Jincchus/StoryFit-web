import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conversations = await prisma.conversation.findMany({
    where: { userId },
    include: {
      characters: { include: { character: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      userPersona: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(conversations)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  if (!body.title) return NextResponse.json({ error: 'title은 필수입니다.' }, { status: 400 })

  const characterIds: string[] = body.characterIds ?? (body.characterId ? [body.characterId] : [])
  if (characterIds.length === 0) return NextResponse.json({ error: 'characterId가 필요합니다.' }, { status: 400 })

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title: body.title,
      mode: body.mode ?? 'roleplay',
      currentAI: body.currentAI ?? 'gemini',
      userPersonaId: body.userPersonaId ?? null,
      scenarioDescription: body.scenarioDescription ?? '',
      tags: body.tags ?? [],
      temperature: body.temperature ?? 0.9,
      frequencyPenalty: body.frequencyPenalty ?? 0.3,
      safetyLevel: body.safetyLevel ?? 'standard',
      characters: {
        create: characterIds.map((id, idx) => ({ characterId: id, turnOrder: idx })),
      },
    },
    include: { characters: { include: { character: true } }, messages: true },
  })
  return NextResponse.json(conversation, { status: 201 })
}
