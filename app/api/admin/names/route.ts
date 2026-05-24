import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth
  const names = await prisma.randomName.findMany({ orderBy: { createdAt: 'asc' }, take: 500 })
  return NextResponse.json(names)
}

export async function POST(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth
  const { name, category, gender } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name이 필요합니다.' }, { status: 400 })
  try {
    const created = await prisma.randomName.create({ data: { name: name.trim(), category: category ?? 'korean', gender: gender ?? '' } })
    return NextResponse.json(created, { status: 201 })
  } catch {
    return NextResponse.json({ error: '이미 존재하는 이름입니다.' }, { status: 409 })
  }
}
