import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const collections = await prisma.characterCollection.findMany({
    where: { sourceUrl: { contains: 'whif.' } },
    include: {
      conversation: { select: { scenarioDescription: true, tags: true } },
      characters: { select: { avatarUrl: true }, take: 1 },
    },
  })

  let updated = 0
  for (const c of collections) {
    const data = {}
    if (!c.description && c.conversation?.scenarioDescription) data.description = c.conversation.scenarioDescription
    if ((!c.tags || c.tags.length === 0) && c.conversation?.tags?.length) data.tags = c.conversation.tags
    if (!c.coverImageUrl && c.characters[0]?.avatarUrl) data.coverImageUrl = c.characters[0].avatarUrl
    if (Object.keys(data).length === 0) continue
    await prisma.characterCollection.update({ where: { id: c.id }, data })
    updated++
  }
  console.log(`backfilled ${updated}/${collections.length} collections`)
}

main().finally(() => prisma.$disconnect())
