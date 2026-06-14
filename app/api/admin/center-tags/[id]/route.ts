import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { getCategories } from '@/lib/centerTags'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const body = await req.json()
  const data: { category?: string | null; searchable?: boolean } = {}

  if ('category' in body) {
    if (body.category === null || body.category === '') {
      data.category = null
    } else if (typeof body.category === 'string') {
      const categories = await getCategories()
      if (!categories.includes(body.category)) return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
      data.category = body.category
    }
  }
  if (typeof body.searchable === 'boolean') data.searchable = body.searchable

  const updated = await prisma.centerTag.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}
