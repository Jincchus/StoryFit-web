import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminLog'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(req)
  if (authResult instanceof NextResponse) return authResult
  const adminId = authResult.userId
  if (adminId === params.id) return NextResponse.json({ error: '자신의 권한은 변경할 수 없습니다.' }, { status: 400 })

  const body = await req.json()
  const data: { isAdmin?: boolean; isActive?: boolean; isApproved?: boolean; rejectionReason?: string } = {}
  if (typeof body.isAdmin === 'boolean') data.isAdmin = body.isAdmin
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body.isApproved === 'boolean') data.isApproved = body.isApproved
  if (typeof body.rejectionReason === 'string') data.rejectionReason = body.rejectionReason

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { email: true } })

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, displayName: true, isAdmin: true, isActive: true, isApproved: true, rejectionReason: true },
  })

  const changes: string[] = []
  if (typeof body.isAdmin === 'boolean') changes.push(`관리자 권한 ${body.isAdmin ? '부여' : '해제'}`)
  if (typeof body.isActive === 'boolean') changes.push(`계정 ${body.isActive ? '활성화' : '비활성화'}`)
  if (typeof body.isApproved === 'boolean') changes.push(`가입 ${body.isApproved ? '승인' : '승인 취소'}`)
  if (typeof body.rejectionReason === 'string' && body.rejectionReason) changes.push(`거절 사유: ${body.rejectionReason}`)
  await logAdminAction(adminId, '유저 정보 변경', `${target?.email ?? params.id} — ${changes.join(', ')}`)

  return NextResponse.json(updated)
}
