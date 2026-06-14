import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

const TYPES = new Set(['collection', 'character'])

function parseItem(body: any): { itemType: string; itemId: string } | null {
  const itemType = String(body?.itemType ?? '')
  const itemId = String(body?.itemId ?? '')
  if (!TYPES.has(itemType) || !itemId) return null
  return { itemType, itemId }
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const favorites = await prisma.favorite.findMany({
    where: { userId },
    select: { itemType: true, itemId: true },
  })
  return NextResponse.json(favorites)
}

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const item = parseItem(await req.json())
  if (!item) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  await prisma.favorite.upsert({
    where: { userId_itemType_itemId: { userId, ...item } },
    create: { userId, ...item },
    update: {},
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const item = parseItem(await req.json())
  if (!item) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  await prisma.favorite.deleteMany({ where: { userId, ...item } })
  return NextResponse.json({ ok: true })
}
