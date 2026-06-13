import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'


export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  const collectionId = searchParams.get('collectionId')

  if (!conversationId && !collectionId) {
    return NextResponse.json([])
  }

  const conditions: any[] = []
  if (conversationId) conditions.push({ conversationId })
  if (collectionId) conditions.push({ collectionId })

  const lorebooks = await prisma.lorebook.findMany({
    where: {
      OR: conditions,
    },
    orderBy: { priority: 'desc' },
  })
  return NextResponse.json(lorebooks)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  if (!body.keyword?.length || !body.content?.trim()) {
    return NextResponse.json({ error: '키워드와 내용은 필수입니다.' }, { status: 400 })
  }

  const lorebook = await prisma.lorebook.create({
    data: {
      keyword: body.keyword,
      content: body.content,
      priority: body.priority ?? 0,
      scanDepth: body.scanDepth ?? 5,
      conversationId: body.conversationId ?? null,
      collectionId: body.collectionId ?? null,
    },
  })
  return NextResponse.json(lorebook, { status: 201 })
}
