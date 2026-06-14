import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { getCategories, renameTagOnCards, removeTagFromCards } from '@/lib/centerTags'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const body = await req.json()
  const current = await prisma.centerTag.findUnique({ where: { id: params.id } })
  if (!current) return NextResponse.json({ error: '태그를 찾을 수 없습니다.' }, { status: 404 })

  // 이름 변경/병합 — 실제 카드 tags 배열까지 반영
  if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== current.name) {
    const newName = body.name.trim().slice(0, 50)
    await renameTagOnCards(current.name, newName)

    const existing = await prisma.centerTag.findUnique({ where: { name: newName } })
    if (existing && existing.id !== current.id) {
      // 병합: 기존 태그로 합치고 현재 행 삭제
      await prisma.centerTag.delete({ where: { id: current.id } })
      return NextResponse.json({ merged: true, into: existing.id })
    }
    await prisma.centerTag.update({ where: { id: current.id }, data: { name: newName } })
  }

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

  const updated = Object.keys(data).length > 0
    ? await prisma.centerTag.update({ where: { id: params.id }, data })
    : await prisma.centerTag.findUnique({ where: { id: params.id } })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const tag = await prisma.centerTag.findUnique({ where: { id: params.id } })
  if (!tag) return NextResponse.json({ error: '태그를 찾을 수 없습니다.' }, { status: 404 })

  await removeTagFromCards(tag.name)
  await prisma.centerTag.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
