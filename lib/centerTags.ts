import { prisma } from '@/lib/prisma'

const CATEGORIES_KEY = 'center_tag_categories'
export const DEFAULT_CATEGORIES = ['세계관', '남자주인공', '여자주인공', '직업', '장르', '성격', '관계', '배경']

export async function getCategories(): Promise<string[]> {
  const cfg = await prisma.globalConfig.findUnique({ where: { key: CATEGORIES_KEY } })
  if (!cfg) return DEFAULT_CATEGORIES
  try {
    const arr = JSON.parse(cfg.value)
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_CATEGORIES
  } catch {
    return DEFAULT_CATEGORIES
  }
}

export async function setCategories(categories: string[]): Promise<void> {
  await prisma.globalConfig.upsert({
    where: { key: CATEGORIES_KEY },
    create: { key: CATEGORIES_KEY, value: JSON.stringify(categories) },
    update: { value: JSON.stringify(categories) },
  })
}

export async function syncCenterTags(): Promise<void> {
  const [chars, cols, existing] = await Promise.all([
    prisma.character.findMany({ select: { tags: true } }),
    prisma.characterCollection.findMany({ select: { tags: true } }),
    prisma.centerTag.findMany({ select: { name: true } }),
  ])
  const have = new Set(existing.map(t => t.name))
  const missing = new Set<string>()
  for (const row of [...chars, ...cols]) {
    for (const raw of row.tags) {
      const name = raw.trim()
      if (name && !have.has(name)) missing.add(name)
    }
  }
  if (missing.size === 0) return
  await prisma.centerTag.createMany({
    data: Array.from(missing).map(name => ({ name })),
    skipDuplicates: true,
  })
}

// 실제 카드(Character/CharacterCollection)의 tags 배열에서 태그 이름을 바꾼다(병합 시 중복 제거).
export async function renameTagOnCards(from: string, to: string): Promise<void> {
  const [chars, cols] = await Promise.all([
    prisma.character.findMany({ where: { tags: { has: from } }, select: { id: true, tags: true } }),
    prisma.characterCollection.findMany({ where: { tags: { has: from } }, select: { id: true, tags: true } }),
  ])
  for (const c of chars) {
    const next = Array.from(new Set(c.tags.map(t => (t === from ? to : t))))
    await prisma.character.update({ where: { id: c.id }, data: { tags: next } })
  }
  for (const c of cols) {
    const next = Array.from(new Set(c.tags.map(t => (t === from ? to : t))))
    await prisma.characterCollection.update({ where: { id: c.id }, data: { tags: next } })
  }
}

// 실제 카드의 tags 배열에서 태그 이름을 제거한다.
export async function removeTagFromCards(name: string): Promise<void> {
  const [chars, cols] = await Promise.all([
    prisma.character.findMany({ where: { tags: { has: name } }, select: { id: true, tags: true } }),
    prisma.characterCollection.findMany({ where: { tags: { has: name } }, select: { id: true, tags: true } }),
  ])
  for (const c of chars) {
    await prisma.character.update({ where: { id: c.id }, data: { tags: c.tags.filter(t => t !== name) } })
  }
  for (const c of cols) {
    await prisma.characterCollection.update({ where: { id: c.id }, data: { tags: c.tags.filter(t => t !== name) } })
  }
}
