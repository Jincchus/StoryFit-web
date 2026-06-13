// 대화 삭제 버그로 함께 삭제된 CharacterCollection(센터 카드) 복구 스크립트.
// sourceUrl이 있는 루트 대화 중 컬렉션 연결이 끊긴 건을 찾아,
// 대화·캐릭터에 남아 있는 데이터로 컬렉션을 재생성하고 다시 연결한다.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function stripConvSuffix(title) {
  return title.replace(/[과와]의 대화$/, '').trim() || title
}

async function main() {
  const convs = await prisma.conversation.findMany({
    where: {
      rootConversationId: null,
      sourceUrl: { not: '' },
      characterCollection: null,
    },
    select: {
      id: true,
      userId: true,
      title: true,
      sourceUrl: true,
      scenarioDescription: true,
      tags: true,
      characters: {
        orderBy: { turnOrder: 'asc' },
        select: { character: { select: { id: true, collectionId: true, avatarUrl: true } } },
      },
    },
  })

  let restored = 0
  let relinked = 0

  for (const conv of convs) {
    const chars = conv.characters.map(cc => cc.character)
    if (chars.length === 0) continue

    const baseSourceUrl = conv.sourceUrl.split('?')[0]

    const existing = await prisma.characterCollection.findFirst({
      where: { userId: conv.userId, sourceUrl: { startsWith: baseSourceUrl } },
      select: { id: true, conversationId: true, title: true },
    })

    if (existing) {
      const orphans = chars.filter(c => c.collectionId === null)
      if (orphans.length > 0) {
        await prisma.character.updateMany({
          where: { id: { in: orphans.map(c => c.id) } },
          data: { collectionId: existing.id },
        })
      }
      if (existing.conversationId === null) {
        await prisma.characterCollection.update({
          where: { id: existing.id },
          data: { conversationId: conv.id },
        })
      }
      if (orphans.length > 0 || existing.conversationId === null) {
        relinked++
        console.log(`재연결: "${existing.title}" ← 대화 "${conv.title}" (캐릭터 ${orphans.length}개)`)
      }
      continue
    }

    if (chars.some(c => c.collectionId !== null)) continue

    const collection = await prisma.characterCollection.create({
      data: {
        title: stripConvSuffix(conv.title),
        sourceUrl: conv.sourceUrl,
        userId: conv.userId,
        conversationId: conv.id,
        coverImageUrl: chars[0].avatarUrl ?? '',
        description: conv.scenarioDescription ?? '',
        tags: conv.tags ?? [],
      },
    })
    await prisma.character.updateMany({
      where: { id: { in: chars.map(c => c.id) } },
      data: { collectionId: collection.id },
    })
    restored++
    console.log(`복구: "${collection.title}" (${conv.sourceUrl}) — 캐릭터 ${chars.length}개, 대화 "${conv.title}"`)
  }

  console.log(`완료 — 컬렉션 재생성 ${restored}건, 기존 컬렉션 재연결 ${relinked}건 (검사 대상 대화 ${convs.length}건)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
