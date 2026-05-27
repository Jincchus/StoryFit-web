import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

const USER_SELECT = {
  displayName: true,
  personalRules: true,
  personalRulesNovel: true,
  personalRulesStory: true,
  defaultTemperature: true,
  defaultFrequencyPenalty: true,
  defaultSafetyLevel: true,
  defaultAI: true,
  theme: true,
} as const

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const [user, globalRulesConfig] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT }),
    prisma.globalConfig.findUnique({ where: { key: 'global_rules' } }),
  ])
  if (!user) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({
    ...user,
    adminGlobalRules: globalRulesConfig?.value ?? '',
  })
}

export async function PATCH(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (typeof body.displayName === 'string') data.displayName = body.displayName
  if (typeof body.personalRules === 'string') data.personalRules = body.personalRules
  if (typeof body.personalRulesNovel === 'string') data.personalRulesNovel = body.personalRulesNovel
  if (typeof body.personalRulesStory === 'string') data.personalRulesStory = body.personalRulesStory
  if (typeof body.defaultTemperature === 'number') data.defaultTemperature = Math.max(0, Math.min(2, body.defaultTemperature))
  if (typeof body.defaultFrequencyPenalty === 'number') data.defaultFrequencyPenalty = Math.max(0, Math.min(2, body.defaultFrequencyPenalty))
  if (['strict', 'standard', 'relaxed'].includes(body.defaultSafetyLevel)) data.defaultSafetyLevel = body.defaultSafetyLevel
  if (['gemini', 'claude', 'chatgpt'].includes(body.defaultAI)) data.defaultAI = body.defaultAI
  if (['retro', 'modern', 'modernwhite', 'win95', 'maple', 'qplay', 'crazyarcade', 'block', 'cyworld'].includes(body.theme)) data.theme = body.theme

  const user = await prisma.user.update({ where: { id: userId }, data, select: USER_SELECT })
  return NextResponse.json(user)
}
