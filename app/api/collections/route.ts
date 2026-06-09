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
      characters: { select: { id: true, name: true, avatarUrl: true } },
    },
  })
  return NextResponse.json(collections)
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
