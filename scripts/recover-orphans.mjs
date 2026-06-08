import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const branches = await prisma.conversation.findMany({
    where: { rootConversationId: { not: null } },
    select: { id: true, rootConversationId: true, createdAt: true, isArchived: true, isPinned: true },
    orderBy: { createdAt: 'asc' },
  })

  const grouped = new Map()
  for (const b of branches) {
    const key = b.rootConversationId
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(b)
  }

  const rootIds = Array.from(grouped.keys())
  const existing = await prisma.conversation.findMany({
    where: { id: { in: rootIds } },
    select: { id: true },
  })
  const existingIds = new Set(existing.map(r => r.id))

  const orphanedRootIds = rootIds.filter(id => !existingIds.has(id))
  console.log(`고아 그룹: ${orphanedRootIds.length}개`)

  let total = 0
  for (const oldRootId of orphanedRootIds) {
    const children = grouped.get(oldRootId).sort((a, b) => a.createdAt - b.createdAt)
    const [newRoot, ...rest] = children
    console.log(`  복구: oldRoot=${oldRootId} → newRoot=${newRoot.id} (${children.length}개)`)

    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: newRoot.id },
        data: { rootConversationId: null, branchFromMessageId: null, branchDescription: '' },
      }),
      ...(rest.length > 0 ? [
        prisma.conversation.updateMany({
          where: { id: { in: rest.map(c => c.id) } },
          data: { rootConversationId: newRoot.id },
        })
      ] : []),
    ])
    total++
  }

  console.log(`완료: ${total}개 그룹 복구됨`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
