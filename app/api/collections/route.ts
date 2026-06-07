import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collections = await prisma.characterCollection.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, sourceUrl: true, createdAt: true },
  })
  return NextResponse.json(collections)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { title } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: '컬렉션 이름이 필요합니다.' }, { status: 400 })

  const collection = await prisma.characterCollection.create({
    data: { title: String(title).trim().slice(0, 200), userId },
  })
  return NextResponse.json(collection, { status: 201 })
}
