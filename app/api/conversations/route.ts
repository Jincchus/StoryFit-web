import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const mode = req.nextUrl.searchParams.get('mode')

  const conversations = await prisma.conversation.findMany({
    where: {
      userId,
      rootConversationId: null,
      isArchived: false,
      mode: mode ? mode : { not: 'assistant' },
    },
    include: {
      characters: { include: { character: { select: { id: true, name: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      personaCharacter: { select: { name: true } },
    },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
  })
  return NextResponse.json(conversations)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const title = String(body.title ?? '').trim().slice(0, 200)
  if (!title) return NextResponse.json({ error: 'title은 필수입니다.' }, { status: 400 })

  const isAssistant = (body.mode ?? 'roleplay') === 'assistant'

  const characterIds: string[] = Array.isArray(body.characterIds)
    ? body.characterIds.slice(0, 10).map(String)
    : body.characterId ? [String(body.characterId)] : []
  if (!isAssistant && characterIds.length === 0) return NextResponse.json({ error: 'characterId가 필요합니다.' }, { status: 400 })

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title,
      mode: body.mode ?? 'roleplay',
      currentAI: body.currentAI ?? 'gemini',
      personaCharacterId: body.personaCharacterId ?? null,
      scenarioDescription: body.scenarioDescription ?? '',
      tags: body.tags ?? [],
      temperature: body.temperature ?? 0.9,
      frequencyPenalty: body.frequencyPenalty ?? 0.3,
      maxOutputTokens: body.maxOutputTokens ?? 8192,
      thinkingBudget: body.thinkingBudget ?? 0,
      safetyLevel: body.safetyLevel ?? 'standard',
      statsEnabled: body.statsEnabled ?? false,
      statsConfig: body.statsConfig ?? null,
      inventoryEnabled: body.inventoryEnabled ?? false,
      inventory: body.inventoryEnabled ? ([] as any) : undefined,
      styleConfig: body.styleConfig ?? null,
      ...(characterIds.length > 0 ? {
        characters: {
          create: characterIds.map((id, idx) => ({ characterId: id, turnOrder: idx })),
        },
      } : {}),
    },
    include: { characters: { include: { character: true } }, messages: true },
  })

  const firstChar = conversation.characters[0]?.character
  if (firstChar?.openingMessage?.trim()) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: firstChar.openingMessage.trim(),
        characterId: firstChar.id,
        isSelected: true,
        isStreaming: false,
      },
    })
  }

  return NextResponse.json(conversation, { status: 201 })
}
