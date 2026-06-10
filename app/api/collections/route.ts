import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

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
        where: { scope: 'collection', scopeId: { in: collectionIds } },
        select: { scopeId: true, keyword: true },
      })
    : []
  const lorebookTitlesByCollection = new Map<string, string[]>()
  for (const lb of lorebooks) {
    const title = lb.keyword?.[0]
    if (!title) continue
    const arr = lorebookTitlesByCollection.get(lb.scopeId) ?? []
    if (!arr.includes(title)) arr.push(title)
    lorebookTitlesByCollection.set(lb.scopeId, arr)
  }

  const result = collections.map(c => ({
    ...c,
    lorebookTitles: lorebookTitlesByCollection.get(c.id) ?? [],
  }))
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
