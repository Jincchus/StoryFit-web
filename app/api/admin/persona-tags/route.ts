import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  const tags = await prisma.personaTag.findMany({ orderBy: [{ category: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(tags)
}

export async function POST(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  const { name, category, gender } = await req.json()
  if (!name?.trim() || !category?.trim()) return NextResponse.json({ error: 'name과 category가 필요합니다.' }, { status: 400 })
  try {
    const created = await prisma.personaTag.create({ data: { name: name.trim(), category, gender: gender ?? '공통' } })
    return NextResponse.json(created, { status: 201 })
  } catch {
    return NextResponse.json({ error: '이미 존재하는 태그입니다.' }, { status: 409 })
  }
}
