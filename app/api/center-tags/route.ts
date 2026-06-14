import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { getCategories } from '@/lib/centerTags'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const [tags, categories] = await Promise.all([
    prisma.centerTag.findMany({ select: { name: true, category: true, searchable: true } }),
    getCategories(),
  ])
  return NextResponse.json({ tags, categories })
}
