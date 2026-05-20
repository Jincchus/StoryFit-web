import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await authenticateAdmin(req)) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  await prisma.characterTag.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
