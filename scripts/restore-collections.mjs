// 대화 삭제 버그로 함께 삭제된 CharacterCollection(센터 카드) 복구 스크립트.
// sourceUrl이 있는 루트 대화 중 컬렉션 연결이 끊긴 건을 찾아,
// 대화·캐릭터에 남아 있는 데이터로 컬렉션을 재생성하고 다시 연결한다.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function stripConvSuffix(title) {
  return title.replace(/[과와]의 대화$/, '').trim() || title
}

// 수동 모드: node scripts/restore-collections.mjs <대화ID> <원본URL>
// 분기 승격 등으로 대화의 sourceUrl이 비어 자동 복구가 불가능한 건을 직접 지정해 복구한다.
async function restoreOne(convId, sourceUrl) {
  const conv = await prisma.conversation.findUnique({
    where: { id: convId },
    select: {
      id: true,
      userId: true,
      title: true,
      sourceUrl: true,
      scenarioDescription: true,
      tags: true,
      characterCollection: { select: { id: true } },
      characters: {
        orderBy: { turnOrder: 'asc' },
        select: { character: { select: { id: true, collectionId: true, avatarUrl: true } } },
      },
    },
  })
  if (!conv) { console.error(`대화를 찾을 수 없음: ${convId}`); process.exit(1) }
  if (conv.characterCollection) { console.log(`이미 컬렉션이 연결되어 있음: ${conv.title}`); return }

  const chars = conv.characters.map(cc => cc.character)
  if (chars.length === 0) { console.error('대화에 캐릭터가 없음'); process.exit(1) }

  if (conv.sourceUrl !== sourceUrl) {
    await prisma.conversation.update({ where: { id: conv.id }, data: { sourceUrl } })
    console.log(`대화 sourceUrl 채움: "${conv.title}" ← ${sourceUrl}`)
  }

  const collection = await prisma.characterCollection.create({
    data: {
      title: stripConvSuffix(conv.title),
      sourceUrl,
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
  console.log(`복구: "${collection.title}" (${sourceUrl}) — 캐릭터 ${chars.length}개, 대화 "${conv.title}"`)
}

async function main() {
  const [argConvId, argUrl] = process.argv.slice(2)
  if (argConvId && argUrl) {
    await restoreOne(argConvId, argUrl)
    return
  }
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

  // sourceUrl이 비어 자동 복구가 불가능한 고아 대화 안내 (가져온 캐릭터인데 컬렉션 없음)
  const orphanConvs = await prisma.conversation.findMany({
    where: {
      rootConversationId: null,
      sourceUrl: '',
      mode: { not: 'assistant' },
      characterCollection: null,
      characters: { some: { character: { isAutoCreated: true, collectionId: null } } },
    },
    select: { id: true, title: true },
  })
  if (orphanConvs.length > 0) {
    console.log('\n⚠ sourceUrl이 없어 자동 복구할 수 없는 대화 — 원본 URL을 지정해 수동 복구하세요:')
    for (const c of orphanConvs) {
      console.log(`  "${c.title}" → node scripts/restore-collections.mjs ${c.id} <원본URL>`)
    }
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
