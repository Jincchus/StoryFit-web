import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminLog'

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth
  const configs = await prisma.globalConfig.findMany()
  const result: Record<string, string> = {}
  for (const c of configs) result[c.key] = c.value
  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (authResult instanceof NextResponse) return authResult
  const adminId = authResult.userId
  const body = await req.json()
  const updates = await Promise.all(
    Object.entries(body).map(([key, value]) =>
      prisma.globalConfig.upsert({
        where: { key },
        update: { value: value as string },
        create: { key, value: value as string },
      })
    )
  )
  await logAdminAction(adminId, '전역 설정 변경', Object.keys(body).join(', '))
  return NextResponse.json(updates)
}
