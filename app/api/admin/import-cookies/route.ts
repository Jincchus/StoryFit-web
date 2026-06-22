import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminLog'

const KEYS = ['whif_session_cookie', 'melting_session_cookie', 'melting_session_nickname', 'babechat_access_token', 'babechat_refresh_token', 'tingle_auth_token', 'tingle_refresh_token', 'tingle_firebase_api_key'] as const

export async function GET(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth
  const configs = await prisma.globalConfig.findMany({ where: { key: { in: [...KEYS] } } })
  const result: Record<string, { value: string; updatedAt: string | null }> = {}
  for (const key of KEYS) result[key] = { value: '', updatedAt: null }
  for (const c of configs) result[c.key] = { value: c.value, updatedAt: c.updatedAt.toISOString() }
  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (authResult instanceof NextResponse) return authResult
  const adminId = authResult.userId
  const body = await req.json()

  const entries = KEYS.filter(key => typeof body[key] === 'string')
  if (entries.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 })

  await Promise.all(
    entries.map(key =>
      prisma.globalConfig.upsert({
        where: { key },
        update: { value: String(body[key]).trim() },
        create: { key, value: String(body[key]).trim() },
      })
    )
  )
  await logAdminAction(adminId, '가져오기 세션 쿠키 변경', entries.join(', '))
  return NextResponse.json({ ok: true })
}
