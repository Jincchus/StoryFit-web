import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminLog'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const adminId = await authenticateAdmin(req)
  if (!adminId) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  if (adminId === params.id) return NextResponse.json({ error: '자신의 권한은 변경할 수 없습니다.' }, { status: 400 })

  const body = await req.json()
  const data: { isAdmin?: boolean; isActive?: boolean; isApproved?: boolean } = {}
  if (typeof body.isAdmin === 'boolean') data.isAdmin = body.isAdmin
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body.isApproved === 'boolean') data.isApproved = body.isApproved

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { email: true } })

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, isAdmin: true, isActive: true, isApproved: true },
  })

  const changes: string[] = []
  if (typeof body.isAdmin === 'boolean') changes.push(`관리자 권한 ${body.isAdmin ? '부여' : '해제'}`)
  if (typeof body.isActive === 'boolean') changes.push(`계정 ${body.isActive ? '활성화' : '비활성화'}`)
  if (typeof body.isApproved === 'boolean') changes.push(`가입 ${body.isApproved ? '승인' : '승인 취소'}`)
  await logAdminAction(adminId, '유저 정보 변경', `${target?.email ?? params.id} — ${changes.join(', ')}`)

  return NextResponse.json(updated)
}
