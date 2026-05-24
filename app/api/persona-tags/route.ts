import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  if (!await authenticate(req)) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const scope = req.nextUrl.searchParams.get('scope') ?? undefined
  const tags = await prisma.characterTag.findMany({
    where: scope ? { scope } : undefined,
    orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json(tags)
}
