import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  // 브랜치인데 부모 루트가 삭제된 고아 대화 찾기
  const branches = await prisma.conversation.findMany({
    where: { rootConversationId: { not: null } },
    select: {
      id: true,
      userId: true,
      rootConversationId: true,
      createdAt: true,
      isArchived: true,
      isPinned: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (branches.length === 0) return NextResponse.json({ recovered: 0, groups: [] })

  // rootConversationId 기준으로 그룹핑
  const grouped = new Map<string, typeof branches>()
  for (const b of branches) {
    const key = b.rootConversationId!
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(b)
  }

  // 실제로 존재하는 루트 ID 조회
  const rootIds = Array.from(grouped.keys())
  const existing = await prisma.conversation.findMany({
    where: { id: { in: rootIds } },
    select: { id: true },
  })
  const existingIds = new Set(existing.map(r => r.id))

  // 존재하지 않는 루트를 가진 그룹 = 고아 그룹
  const orphanedRootIds = rootIds.filter(id => !existingIds.has(id))

  const results: { oldRoot: string; newRoot: string; promoted: number }[] = []

  for (const oldRootId of orphanedRootIds) {
    const children = grouped.get(oldRootId)!.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )
    const [newRoot, ...rest] = children

    await prisma.$transaction([
      // 가장 오래된 브랜치를 새 루트로 승격
      prisma.conversation.update({
        where: { id: newRoot.id },
        data: {
          rootConversationId: null,
          branchFromMessageId: null,
          branchDescription: '',
          isArchived: newRoot.isArchived,
          isPinned: newRoot.isPinned,
        },
      }),
      // 나머지는 새 루트에 재연결
      ...(rest.length > 0
        ? [prisma.conversation.updateMany({
            where: { id: { in: rest.map(c => c.id) } },
            data: { rootConversationId: newRoot.id },
          })]
        : []),
    ])

    results.push({ oldRoot: oldRootId, newRoot: newRoot.id, promoted: children.length })
  }

  return NextResponse.json({ recovered: results.length, groups: results })
}
