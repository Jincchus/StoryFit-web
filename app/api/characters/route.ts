import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { aggregateCounts, isCompleted, hasArchived, type CountableConversation } from '@/lib/completion'
import { centerByApiParam } from '@/lib/centers'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  // isXxx=true 쿼리 → 센터 정의. (단일 소스: lib/centers.ts)
  const matchedCenter = centerByApiParam(searchParams)

  const whereClause: any = matchedCenter
    ? { creatorId: userId, collection: { sourceUrl: { contains: matchedCenter.dbHosts[0] } } }
    : {
        AND: [
          { OR: [{ isPreset: true }, { creatorId: userId }] },
          // 팅글 서사(universes)/테마(scenes)는 세계관·배경 컨테이너로, 실제 캐릭터가 아님 — 캐릭터 목록에서 제외
          { NOT: { collection: { sourceUrl: { contains: 'tingle.chat/chat/universes/' } } } },
          { NOT: { collection: { sourceUrl: { contains: 'tingle.chat/chat/scenes/' } } } },
        ],
      }

  const collectionId = searchParams.get('collectionId')
  const unassigned = searchParams.get('unassigned') === 'true'
  const finalWhere = unassigned
    // 페르소나 후보는 사용자가 "직접 등록"(POST /api/characters)했거나 "복제"(duplicate)한
    // 캐릭터만 노출한다. 가져오기로 생성돼 아직 설정이 필요한 "대기 중" 캐릭터(isAutoCreated)는 제외.
    ? { creatorId: userId, collectionId: null, isAutoCreated: false }
    : collectionId
      ? { ...whereClause, collectionId }
      : whereClause

  const characters = await prisma.character.findMany({
    where: finalWhere,
    orderBy: [{ isPreset: 'desc' }, { createdAt: 'asc' }],
    // 목록 조회 시 대용량 텍스트 필드(additionalInfo·exampleDialogues·openingMessage·openingMessages·relatedImages)는
    // 제외 — 수정 페이지에서 단건 조회 시 포함됨. 이 최적화 덕분에 수천 개 캐릭터를 가진 사용자도
    // 빠르게 목록을 받을 수 있다.
    select: {
      id: true, name: true, gender: true, avatarUrl: true, tags: true,
      safetyLevel: true, temperature: true, frequencyPenalty: true,
      maxOutputTokens: true, thinkingBudget: true, defaultAI: true,
      isPreset: true, isAutoCreated: true, isPersonaPreset: true, createdAt: true,
      creatorId: true, collectionId: true,
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
      ...personaRooms.map(pr => ({ isArchived: pr.isArchived, rootConversationId: null, mode: 'story' })),
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
      started: counts.activeCount + counts.archivedCount > 0,
    }
  })

  // unassigned=true는 대화 시작 시 "페르소나 후보" 전용 조회다. 완결(모든 대화가 보관됨)이거나
  // 이미 다른 대화방/컬렉션에 매핑된(rooms 있는) 후보는 제외해, 아직 안 쓴 페르소나만 노출한다.
  if (unassigned) {
    return NextResponse.json(result.filter(r => !r.completed && r.rooms.length === 0))
  }

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
  const secretSettings = String(body.secretSettings ?? '').slice(0, 10000)
  const exampleDialogues = String(body.exampleDialogues ?? '').slice(0, 20000)
  const openingMessage = String(body.openingMessage ?? '').slice(0, 5000)
  // 다중 도입부(선택): {id,title,content} 배열. 2개 이상일 때만 저장.
  const openingMessages = Array.isArray(body.openingMessages) && body.openingMessages.length > 1
    ? body.openingMessages
        .map((o: any, i: number) => ({ id: String(o?.id ?? `op-${i}`), title: String(o?.title ?? `도입부 ${i + 1}`).slice(0, 100), content: String(o?.content ?? '').slice(0, 5000) }))
        .filter((o: any) => o.content.trim())
    : undefined

  const avatarUrl: string | undefined = body.avatarUrl
    ? /^https?:\/\/.{1,2000}/.test(body.avatarUrl) || /^\/api\/uploads\//.test(body.avatarUrl) ? body.avatarUrl : undefined
    : undefined

  const safetyLevel = ['strict', 'standard', 'relaxed'].includes(body.safetyLevel) ? body.safetyLevel : 'standard'
  const temperature = Math.min(2, Math.max(0, Number(body.temperature) || 0.9))
  const frequencyPenalty = Math.min(2, Math.max(0, Number(body.frequencyPenalty) || 0.3))
  const defaultAI = 'gemini'
  const collectionId = body.collectionId ? String(body.collectionId) : null

  const character = await prisma.character.create({
    data: {
      name,
      gender: String(body.gender ?? '').slice(0, 20),
      tags,
      additionalInfo,
      secretSettings,
      exampleDialogues,
      openingMessage,
      ...(openingMessages && openingMessages.length > 1 ? { openingMessages } : {}),
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
