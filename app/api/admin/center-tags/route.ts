import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { getCategories, setCategories, syncCenterTags } from '@/lib/centerTags'

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  await syncCenterTags()
  const [tags, categories] = await Promise.all([
    prisma.centerTag.findMany({ orderBy: [{ name: 'asc' }] }),
    getCategories(),
  ])
  return NextResponse.json({ tags, categories })
}

export async function POST(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const { category } = await req.json()
  const name = String(category ?? '').trim()
  if (!name) return NextResponse.json({ error: '카테고리 이름이 필요합니다.' }, { status: 400 })

  const categories = await getCategories()
  if (!categories.includes(name)) {
    categories.push(name)
    await setCategories(categories)
  }
  return NextResponse.json({ categories })
}
