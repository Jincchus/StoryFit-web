import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generatePlotOutline } from '@/lib/plotOutline'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const isWhif = searchParams.get('isWhif') === 'true'
  const mode = searchParams.get('mode')
  const characterId = searchParams.get('characterId')

  const whereClause: any = {
    userId,
    rootConversationId: null,
    isArchived: false,
    mode: mode ? mode : { not: 'assistant' },
  }

  if (isWhif) {
    whereClause.sourceUrl = { contains: 'whif.' }
  }

  if (characterId) {
    whereClause.characters = { some: { characterId } }
  }

  const conversations = await prisma.conversation.findMany({
    where: whereClause,
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

  const mode = ['story', 'multiStory', 'assistant'].includes(body.mode) ? body.mode : 'story'
  const isAssistant = mode === 'assistant'

  const characterIds: string[] = Array.isArray(body.characterIds)
    ? body.characterIds.slice(0, 10).map(String)
    : body.characterId ? [String(body.characterId)] : []
  if (!isAssistant && characterIds.length === 0) return NextResponse.json({ error: 'characterId가 필요합니다.' }, { status: 400 })

  // Find collections of selected characters to determine sourceUrl and lorebooks
  const selectedChars = await prisma.character.findMany({
    where: { id: { in: characterIds } },
    select: { collectionId: true },
  })
  const collectionIds = Array.from(new Set(selectedChars.map(c => c.collectionId).filter(Boolean))) as string[]

  let convSourceUrl = body.sourceUrl ?? ''
  if (!convSourceUrl && collectionIds.length > 0) {
    const col = await prisma.characterCollection.findFirst({
      where: { id: { in: collectionIds } },
      select: { sourceUrl: true }
    })
    if (col?.sourceUrl) {
      convSourceUrl = col.sourceUrl
    }
  }

  // 페르소나 캐릭터를 상대 캐릭터의 컬렉션에 합류시켜 캐릭터 디테일/완결창에서 함께 노출
  const personaCharacterId: string | null = body.personaCharacterId ?? null
  if (personaCharacterId && collectionIds.length > 0) {
    const persona = await prisma.character.findFirst({
      where: { id: personaCharacterId, creatorId: userId },
      select: { collectionId: true },
    })
    if (persona && !persona.collectionId) {
      await prisma.character.update({
        where: { id: personaCharacterId },
        data: { collectionId: collectionIds[0] },
      })
    }
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title,
      mode,
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
      suggestRepliesEnabled: body.suggestRepliesEnabled ?? false,
      autoChapterEnabled: body.autoChapterEnabled ?? false,
      sourceUrl: convSourceUrl,
      ...(characterIds.length > 0 ? {
        characters: {
          create: characterIds.map((id, idx) => ({ characterId: id, turnOrder: idx })),
        },
      } : {}),
    },
    include: { characters: { include: { character: true } }, messages: true },
  })

  // Clone collection-level lorebooks to this conversation
  if (collectionIds.length > 0) {
    const collectionLorebooks = await prisma.lorebook.findMany({
      where: { collectionId: { in: collectionIds } },
    })

    if (collectionLorebooks.length > 0) {
      await Promise.all(
        collectionLorebooks.map(lb =>
          prisma.lorebook.create({
            data: {
              keyword: lb.keyword,
              content: lb.content,
              priority: lb.priority,
              scanDepth: lb.scanDepth,
              conversationId: conversation.id,
            },
          })
        )
      )
    }
  }

  const chars = conversation.characters.map(cc => cc.character)
  const firstChar = chars[0]
  const seenOpenings = new Map<string, string>()
  for (const char of chars) {
    const content = char.id === firstChar?.id && body.openingMessage !== undefined
      ? String(body.openingMessage || '').trim()
      : (char.openingMessage || '').trim()
    if (!content) continue
    if (seenOpenings.has(content)) continue
    seenOpenings.set(content, char.id)
  }

  for (const [content, characterId] of Array.from(seenOpenings)) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content,
        characterId,
        isSelected: true,
        isStreaming: false,
      },
    })
  }

  const plotChapters = parseInt(body.plotChapters)
  if (!isAssistant && plotChapters >= 2) {
    const characterLines = conversation.characters
      .map(cc => `${cc.character.name}${cc.character.tags?.length ? ` (${cc.character.tags.join(', ')})` : ''}: ${(cc.character.additionalInfo ?? '').slice(0, 300)}`)
      .join('\n')
    const openingText = Array.from(seenOpenings.keys()).join('\n\n').slice(0, 2000)
    generatePlotOutline({
      scenario: conversation.scenarioDescription,
      characterLines,
      totalChapters: Math.min(30, plotChapters),
      storySoFar: openingText,
      currentChapter: 1,
    }).then(outline => {
      if (outline) {
        return prisma.conversation.update({
          where: { id: conversation.id },
          data: { plotOutline: { ...outline, mode: 'auto' } as any },
        })
      }
    }).catch(err => console.error('[plotOutline] 신규 대화 설계도 생성 실패:', err))
  }

  return NextResponse.json(conversation, { status: 201 })
}
