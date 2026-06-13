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
    : 'regular'

  const whereClause: any = { userId }

  if (source === 'whif') {
    whereClause.sourceUrl = { contains: 'whif.' }
  } else if (source === 'zeta') {
    whereClause.sourceUrl = { contains: 'zeta-ai.io' }
  } else if (source === 'melting') {
    whereClause.sourceUrl = { contains: 'melting.chat' }
  } else {
    whereClause.AND = [
      { NOT: { sourceUrl: { contains: 'whif.' } } },
      { NOT: { sourceUrl: { contains: 'zeta-ai.io' } } },
      { NOT: { sourceUrl: { contains: 'melting.chat' } } },
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
          conversation: { select: { id: true, isArchived: true, rootConversationId: true, mode: true } },
        },
      })
    : []

  const convsByCollection = new Map<string, Map<string, CountableConversation>>()
  const archivedCharIds = new Set<string>()
  for (const link of collectionConvLinks) {
    const colId = link.character.collectionId
    if (!colId) continue
    const map = convsByCollection.get(colId) ?? new Map<string, CountableConversation>()
    map.set(link.conversation.id, link.conversation)
    convsByCollection.set(colId, map)
    const cv = link.conversation
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
