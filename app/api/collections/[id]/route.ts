import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collection = await prisma.characterCollection.findFirst({
    where: { id: params.id, userId },
    include: {
      characters: true,
    },
  })

  if (!collection) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json(collection)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collection = await prisma.characterCollection.findFirst({
    where: { id: params.id, userId },
  })

  if (!collection) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { title } = await req.json()
  if (!title?.trim()) {
    return NextResponse.json({ error: '컬렉션 이름이 필요합니다.' }, { status: 400 })
  }

  const updated = await prisma.characterCollection.update({
    where: { id: params.id },
    data: { title: String(title).trim().slice(0, 200) },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const collection = await prisma.characterCollection.findFirst({
    where: { id: params.id, userId },
  })

  if (!collection) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
  }

  // Transaction: 
  // 1. 컬렉션에 소속된 캐릭터들의 collectionId를 null로 해제하여 캐릭터 보존
  // 2. 컬렉션 스코프의 로어북 설정 카드 삭제
  // 3. 컬렉션 삭제
  await prisma.$transaction([
    prisma.character.updateMany({
      where: { collectionId: params.id },
      data: { collectionId: null },
    }),
    prisma.lorebook.deleteMany({
      where: { scope: 'collection', scopeId: params.id },
    }),
    prisma.characterCollection.delete({
      where: { id: params.id },
    }),
  ])

  return new NextResponse(null, { status: 204 })
}
