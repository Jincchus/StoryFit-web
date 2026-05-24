import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const [user, globalRulesConfig] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, personalRules: true } }),
    prisma.globalConfig.findUnique({ where: { key: 'global_rules' } }),
  ])
  if (!user) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({
    displayName: user.displayName,
    personalRules: user.personalRules,
    adminGlobalRules: globalRulesConfig?.value ?? '',
  })
}

export async function PATCH(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const data: { displayName?: string; personalRules?: string } = {}
  if (typeof body.displayName === 'string') data.displayName = body.displayName
  if (typeof body.personalRules === 'string') data.personalRules = body.personalRules

  const user = await prisma.user.update({ where: { id: userId }, data })
  return NextResponse.json({ displayName: user.displayName, personalRules: user.personalRules })
}
