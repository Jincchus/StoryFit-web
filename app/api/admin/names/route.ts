import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  const names = await prisma.randomName.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json(names)
}

export async function POST(req: NextRequest) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  const { name, category } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name이 필요합니다.' }, { status: 400 })
  try {
    const created = await prisma.randomName.create({ data: { name: name.trim(), category: category ?? 'korean' } })
    return NextResponse.json(created, { status: 201 })
  } catch {
    return NextResponse.json({ error: '이미 존재하는 이름입니다.' }, { status: 409 })
  }
}
