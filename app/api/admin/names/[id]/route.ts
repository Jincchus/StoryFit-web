import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth
  await prisma.randomName.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
