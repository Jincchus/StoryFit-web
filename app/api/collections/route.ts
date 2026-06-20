import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { aggregateCounts, isCompleted, type CountableConversation } from '@/lib/completion'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('isWhif') === 'true' ? 'whif'
    : searchParams.get('isZeta') === 'true' ? 'zeta'
    : searchParams.get('isMelting') === 'true' ? 'melting'
    : searchParams.get('isTikita') === 'true' ? 'tikita'
    : searchParams.get('isChub') === 'true' ? 'chub'
    : searchParams.get('isRofan') === 'true' ? 'rofan'
    : searchParams.get('isLoveydovey') === 'true' ? 'loveydovey'
    : searchParams.get('isBabechat') === 'true' ? 'babechat'
    : 'regular'

  const whereClause: any = { userId }

  if (source === 'whif') {
    whereClause.sourceUrl = { contains: 'whif.' }
  } else if (source === 'zeta') {
    whereClause.sourceUrl = { contains: 'zeta-ai.io' }
  } else if (source === 'melting') {
    whereClause.sourceUrl = { contains: 'melting.chat' }
  } else if (source === 'tikita') {
    whereClause.sourceUrl = { contains: 'tikita.ai' }
  } else if (source === 'chub') {
    whereClause.sourceUrl = { contains: 'chub.ai' }
  } else if (source === 'rofan') {
    whereClause.sourceUrl = { contains: 'rofan.ai' }
  } else if (source === 'loveydovey') {
    whereClause.sourceUrl = { contains: 'loveydovey.ai' }
  } else if (source === 'babechat') {
    whereClause.sourceUrl = { contains: 'babechat.' }
  } else {
    whereClause.AND = [
      { NOT: { sourceUrl: { contains: 'whif.' } } },
      { NOT: { sourceUrl: { contains: 'zeta-ai.io' } } },
      { NOT: { sourceUrl: { contains: 'melting.chat' } } },
      { NOT: { sourceUrl: { contains: 'tikita.ai' } } },
      { NOT: { sourceUrl: { contains: 'chub.ai' } } },
      { NOT: { sourceUrl: { contains: 'rofan.ai' } } },
      { NOT: { sourceUrl: { contains: 'loveydovey.ai' } } },
      { NOT: { sourceUrl: { contains: 'babechat.' } } },
    ]
  }

  const collections = await prisma.characterCollection.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      createdAt: true,
      coverImageUrl: true,
      description: true,
      tags: true,
      zetaMeta: true,
      meltingMeta: true,
      tikitaMeta: true,
      characters: { select: { id: true, name: true, avatarUrl: true, openingMessage: true, openingMessages: true } },
    },
  })

  const collectionIds = collections.map(c => c.id)
  const lorebooks = collectionIds.length > 0
    ? await prisma.lorebook.findMany({
        where: { collectionId: { in: collectionIds } },
        select: { collectionId: true, keyword: true },
      })
    : []
  const lorebookTitlesByCollection = new Map<string, string[]>()
  for (const lb of lorebooks) {
    const title = lb.keyword?.[0]
    if (!title || !lb.collectionId) continue
    const arr = lorebookTitlesByCollection.get(lb.collectionId) ?? []
    if (!arr.includes(title)) arr.push(title)
    lorebookTitlesByCollection.set(lb.collectionId, arr)
  }

  // 컬렉션 단위 대화 집계 (소속 캐릭터 기준). 한 대화에 같은 컬렉션 캐릭터가 둘 이상이어도 1회만 집계.
  const collectionConvLinks = collectionIds.length > 0
    ? await prisma.conversationCharacter.findMany({
        where: { conversation: { userId }, character: { collectionId: { in: collectionIds } } },
        select: {
          characterId: true,
          character: { select: { collectionId: true } },
          conversation: { select: { id: true, isArchived: true, rootConversationId: true, mode: true, updatedAt: true } },
        },
      })
    : []

  const convsByCollection = new Map<string, Map<string, CountableConversation>>()
  const lastActivityByCollection = new Map<string, string>()
  const archivedCharIds = new Set<string>()
  for (const link of collectionConvLinks) {
    const colId = link.character.collectionId
    if (!colId) continue
    const map = convsByCollection.get(colId) ?? new Map<string, CountableConversation>()
    map.set(link.conversation.id, link.conversation)
    convsByCollection.set(colId, map)
    const cv = link.conversation
    // 마지막 대화 활동시각 추적 (최근 대화순 정렬용)
    const ua = cv.updatedAt instanceof Date ? cv.updatedAt.toISOString() : String(cv.updatedAt)
    const prev = lastActivityByCollection.get(colId)
    if (!prev || ua > prev) lastActivityByCollection.set(colId, ua)
    if (cv.isArchived && cv.rootConversationId === null && cv.mode !== 'assistant') {
      archivedCharIds.add(link.characterId)
    }
  }

  const result = collections.map(c => {
    const convMap = convsByCollection.get(c.id)
    const counts = aggregateCounts(convMap ? Array.from(convMap.values()) : [])
    return {
      ...c,
      lorebookTitles: lorebookTitlesByCollection.get(c.id) ?? [],
      completed: isCompleted(counts),
      started: counts.activeCount + counts.archivedCount > 0,
      lastActivityAt: lastActivityByCollection.get(c.id) ?? c.createdAt,
      characters: c.characters.map(ch => ({ ...ch, hasArchived: archivedCharIds.has(ch.id) })),
    }
  })
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { title, sourceUrl } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: '컬렉션 이름이 필요합니다.' }, { status: 400 })

  const collection = await prisma.characterCollection.create({
    data: { 
      title: String(title).trim().slice(0, 200), 
      sourceUrl: sourceUrl ? String(sourceUrl).trim().slice(0, 2000) : '',
      userId 
    },
  })
  return NextResponse.json(collection, { status: 201 })
}
