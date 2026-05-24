import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const [convCount, msgAggregate, byModel] = await Promise.all([
    prisma.conversation.count({ where: { userId } }),
    prisma.message.aggregate({
      where: { conversation: { userId } },
      _count: { id: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.message.groupBy({
      by: ['aiModel'],
      where: { conversation: { userId }, role: 'assistant', aiModel: { not: null } },
      _count: { id: true },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ])

  return NextResponse.json({
    conversationCount: convCount,
    messageCount: msgAggregate._count.id,
    totalInputTokens: msgAggregate._sum.inputTokens ?? 0,
    totalOutputTokens: msgAggregate._sum.outputTokens ?? 0,
    byModel: byModel.map(m => ({
      model: m.aiModel ?? 'unknown',
      count: m._count.id,
      inputTokens: m._sum.inputTokens ?? 0,
      outputTokens: m._sum.outputTokens ?? 0,
    })),
  })
}
