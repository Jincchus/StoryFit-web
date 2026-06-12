import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function renameConfigKey(oldKey, newKey) {
  const oldRow = await prisma.globalConfig.findUnique({ where: { key: oldKey } })
  if (!oldRow) return
  const newRow = await prisma.globalConfig.findUnique({ where: { key: newKey } })
  if (!newRow) {
    await prisma.globalConfig.create({ data: { key: newKey, value: oldRow.value } })
  }
  await prisma.globalConfig.delete({ where: { key: oldKey } })
  console.log(`GlobalConfig: ${oldKey} → ${newKey}`)
}

async function main() {
  const tikiTaka = await prisma.conversation.updateMany({
    where: { mode: 'tikiTaka' },
    data: { mode: 'multiStory' },
  })
  console.log(`Conversation: tikiTaka → multiStory (${tikiTaka.count}개)`)

  const legacy = await prisma.conversation.updateMany({
    where: { mode: { in: ['novel', 'roleplay'] } },
    data: { mode: 'story' },
  })
  console.log(`Conversation: novel/roleplay → story (${legacy.count}개)`)

  await renameConfigKey('roleplay_rules', 'multiStory_rules')
  await renameConfigKey('roleplay_closing', 'multiStory_closing')

  const deletedNovel = await prisma.globalConfig.deleteMany({
    where: { key: { in: ['novel_rules', 'novel_closing'] } },
  })
  console.log(`GlobalConfig: novel_* 삭제 (${deletedNovel.count}개)`)

  const remaining = await prisma.conversation.groupBy({ by: ['mode'], _count: true })
  console.log('현재 모드 분포:', remaining.map(r => `${r.mode}=${r._count}`).join(', '))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
