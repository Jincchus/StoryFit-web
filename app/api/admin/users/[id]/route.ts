import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const adminId = await authenticateAdmin(req)
  if (!adminId) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  if (adminId === params.id) return NextResponse.json({ error: '자신의 권한은 변경할 수 없습니다.' }, { status: 400 })

  const body = await req.json()
  const data: { isAdmin?: boolean; isActive?: boolean } = {}
  if (typeof body.isAdmin === 'boolean') data.isAdmin = body.isAdmin
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, isAdmin: true, isActive: true },
  })
  return NextResponse.json(updated)
}
