import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { pickLatestNodeIdsPerThread } from '@/lib/recentThreads'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') ?? '3') || 3))

  // 1) 경량: 모든 노드(root+분기)의 스레드 키·시각만
  const nodes = await prisma.conversation.findMany({
    where: { userId, isArchived: false, mode: { not: 'assistant' } },
    select: { id: true, rootConversationId: true, updatedAt: true },
  })
  const ids = pickLatestNodeIdsPerThread(nodes, limit)
  if (ids.length === 0) return NextResponse.json([])

  // 2) 상위 N개만 풀 조회(활성 분기 isSelected 최신 메시지)
  const convs = await prisma.conversation.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, title: true, mode: true, updatedAt: true,
      characters: { include: { character: { select: { id: true, name: true, avatarUrl: true } } } },
      messages: { where: { isSelected: true }, orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } },
    },
  })
  // ids 정렬 순서 유지
  const byId = new Map(convs.map(c => [c.id, c]))
  const ordered = ids.map(id => byId.get(id)).filter(Boolean)
  return NextResponse.json(ordered)
}
