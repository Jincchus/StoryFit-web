import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { aggregateCounts, isCompleted, hasArchived, type CountableConversation } from '@/lib/completion'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('isWhif') === 'true' ? 'whif'
    : searchParams.get('isZeta') === 'true' ? 'zeta'
    : searchParams.get('isMelting') === 'true' ? 'melting'
    : 'regular'

  const whereClause =
    source === 'whif'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'whif.' } } }
    : source === 'zeta'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'zeta-ai.io' } } }
    : source === 'melting'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'melting.chat' } } }
      : {
          OR: [
            { isPreset: true },
            { creatorId: userId },
          ],
        }

  const characters = await prisma.character.findMany({
    where: whereClause,
    orderBy: [{ isPreset: 'desc' }, { createdAt: 'asc' }],
    include: {
      collection: { select: { id: true, title: true, sourceUrl: true } },
      conversations: {
        where: { conversation: { userId, characterCollection: { isNot: null } } },
        take: 1,
        select: {
          conversation: {
            select: { characterCollection: { select: { id: true, title: true } } },
          },
        },
      },
      personaConversations: {
        where: { userId, characterCollection: { isNot: null } },
        take: 1,
        select: { characterCollection: { select: { id: true, title: true } } },
      },
    },
  })

  // 캐릭터별 대화 집계 (완결/뱃지 판정용)
  const charIds = characters.map(c => c.id)
  const convLinks = charIds.length > 0
    ? await prisma.conversationCharacter.findMany({
        where: { characterId: { in: charIds }, conversation: { userId } },
        select: {
          characterId: true,
          conversation: { select: { isArchived: true, rootConversationId: true, mode: true } },
        },
      })
    : []

  const convsByChar = new Map<string, CountableConversation[]>()
  for (const link of convLinks) {
    const arr = convsByChar.get(link.characterId) ?? []
    arr.push(link.conversation)
    convsByChar.set(link.characterId, arr)
  }

  // 페르소나로 참여한 대화 집계 (완결 판정 + 참여 대화방 태그용)
  const personaConvs = charIds.length > 0
    ? await prisma.conversation.findMany({
        where: {
          personaCharacterId: { in: charIds },
          userId,
          rootConversationId: null,
          mode: { not: 'assistant' },
        },
        select: { id: true, title: true, isArchived: true, personaCharacterId: true },
      })
    : []

  const personaRoomsByChar = new Map<string, { id: string; title: string; isArchived: boolean }[]>()
  for (const pc of personaConvs) {
    const charId = pc.personaCharacterId as string
    const arr = personaRoomsByChar.get(charId) ?? []
    arr.push({ id: pc.id, title: pc.title, isArchived: pc.isArchived })
    personaRoomsByChar.set(charId, arr)
  }

  // 직접 collectionId → ConversationCharacter 경유 → 페르소나로 사용된 대화 순으로 컬렉션 결정
  const result = characters.map(({ conversations, personaConversations, ...c }) => {
    const personaRooms = personaRoomsByChar.get(c.id) ?? []
    const counts = aggregateCounts([
      ...(convsByChar.get(c.id) ?? []),
      ...personaRooms.map(pr => ({ isArchived: pr.isArchived, rootConversationId: null, mode: 'roleplay' })),
    ])

    const collection = c.collection
      ?? conversations[0]?.conversation?.characterCollection
      ?? personaConversations[0]?.characterCollection
      ?? null

    const roomsMap = new Map<string, string>()
    const roomTitles = new Set<string>()
    if (collection) { roomsMap.set(collection.id, collection.title); roomTitles.add(collection.title) }
    for (const pr of personaRooms) {
      if (roomTitles.has(pr.title)) continue
      roomsMap.set(pr.id, pr.title)
      roomTitles.add(pr.title)
    }

    return {
      ...c,
      collection,
      rooms: Array.from(roomsMap.entries()).map(([id, title]) => ({ id, title })),
      completed: isCompleted(counts),
      hasArchived: hasArchived(counts),
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const name = body.name?.trim() ?? ''
  if (!name) return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })
  if (name.length > 100) return NextResponse.json({ error: '이름은 100자 이하여야 합니다.' }, { status: 400 })

  const tags: string[] = Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t: string) => String(t).slice(0, 50)) : []
  const additionalInfo = String(body.additionalInfo ?? '').slice(0, 10000)
  const exampleDialogues = String(body.exampleDialogues ?? '').slice(0, 20000)
  const openingMessage = String(body.openingMessage ?? '').slice(0, 5000)

  const avatarUrl: string | undefined = body.avatarUrl
    ? /^https?:\/\/.{1,2000}/.test(body.avatarUrl) || /^\/api\/uploads\//.test(body.avatarUrl) ? body.avatarUrl : undefined
    : undefined

  const safetyLevel = ['strict', 'standard', 'relaxed'].includes(body.safetyLevel) ? body.safetyLevel : 'standard'
  const temperature = Math.min(2, Math.max(0, Number(body.temperature) || 0.9))
  const frequencyPenalty = Math.min(2, Math.max(0, Number(body.frequencyPenalty) || 0.3))
  const defaultAI = ['gemini', 'claude', 'chatgpt'].includes(body.defaultAI) ? body.defaultAI : 'gemini'
  const collectionId = body.collectionId ? String(body.collectionId) : null

  const character = await prisma.character.create({
    data: {
      name,
      gender: String(body.gender ?? '').slice(0, 20),
      tags,
      additionalInfo,
      exampleDialogues,
      openingMessage,
      avatarUrl,
      safetyLevel,
      temperature,
      frequencyPenalty,
      defaultAI,
      creatorId: userId,
      collectionId,
    },
  })
  return NextResponse.json(character, { status: 201 })
}
