import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth
  const tags = await prisma.characterTag.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 500 })
  return NextResponse.json(tags)
}

export async function POST(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth
  const { name, category, gender } = await req.json()
  if (!name?.trim() || !category?.trim()) return NextResponse.json({ error: 'name과 category가 필요합니다.' }, { status: 400 })
  try {
    const created = await prisma.characterTag.create({ data: { name: name.trim(), category, gender: gender ?? '공통' } })
    return NextResponse.json(created, { status: 201 })
  } catch {
    return NextResponse.json({ error: '이미 존재하는 태그입니다.' }, { status: 409 })
  }
}
