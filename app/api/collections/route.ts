import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { aggregateCounts, isCompleted, type CountableConversation } from '@/lib/completion'
import { EXTERNAL_HOSTS, centerByApiParam } from '@/lib/centers'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const isAll = searchParams.get('all') === 'true'
  // isXxx=true 쿼리 → 센터 정의. (단일 소스: lib/centers.ts)
  const matchedCenter = centerByApiParam(searchParams)

  const whereClause: any = { userId }

  if (isAll) {
    whereClause.OR = EXTERNAL_HOSTS.map(h => ({ sourceUrl: { contains: h } }))
  } else if (matchedCenter) {
    whereClause.OR = matchedCenter.dbHosts.map(h => ({ sourceUrl: { contains: h } }))
  } else {
    // 'regular' — 외부 센터에 속하지 않는 컬렉션
    whereClause.AND = EXTERNAL_HOSTS.map(h => ({ NOT: { sourceUrl: { contains: h } } }))
  }

  // 경량 모드: 드롭다운 등 id·title만 필요할 때. 거대 메타(zeta/melting/tikitaMeta) select와
  // 로어북은 건너뛴다(수정 페이지 컬렉션 선택용). 완결 여부(completed)는 함께 계산해
  // 카드 선택 드롭다운에서 완결 카드를 걸러낼 수 있게 한다.
  if (searchParams.get('fields') === 'basic') {
    const basic = await prisma.characterCollection.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, sourceUrl: true },
    })
    const ids = basic.map(c => c.id)
    const links = ids.length > 0
      ? await prisma.conversationCharacter.findMany({
          where: { conversation: { userId }, character: { collectionId: { in: ids } } },
          select: {
            character: { select: { collectionId: true } },
            conversation: { select: { id: true, isArchived: true, rootConversationId: true, mode: true } },
          },
        })
      : []
    const byCol = new Map<string, Map<string, CountableConversation>>()
    for (const link of links) {
      const colId = link.character.collectionId
      if (!colId) continue
      const m = byCol.get(colId) ?? new Map<string, CountableConversation>()
      m.set(link.conversation.id, link.conversation)
      byCol.set(colId, m)
    }
    return NextResponse.json(basic.map(c => ({
      ...c,
      completed: isCompleted(aggregateCounts(Array.from(byCol.get(c.id)?.values() ?? []))),
    })))
  }

  const isIndex = searchParams.get('fields') === 'index'

  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

  const collections = await prisma.characterCollection.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    ...(isIndex ? {} : (limit ? { take: limit, skip: offset } : {})),
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      createdAt: true,
      coverImageUrl: true,
      description: true,
      tags: true,
      // 메타는 index에도 포함 — zeta(shortDescription)·tikita(tagline) 카드가 사용.
      zetaMeta: true, meltingMeta: true, tikitaMeta: true,
      characters: {
        select: isIndex
          ? { id: true, name: true, avatarUrl: true, gender: true }
          : { id: true, name: true, avatarUrl: true, gender: true, openingMessage: true, openingMessages: true },
      },
    },
  })

  const collectionIds = collections.map(c => c.id)
  const lorebooks = (!isIndex && collectionIds.length > 0)
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
    const base = {
      ...c,
      completed: isCompleted(counts),
      started: counts.activeCount + counts.archivedCount > 0,
      lastActivityAt: lastActivityByCollection.get(c.id) ?? c.createdAt,
    }
    if (isIndex) return base
    return {
      ...base,
      lorebookTitles: lorebookTitlesByCollection.get(c.id) ?? [],
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
