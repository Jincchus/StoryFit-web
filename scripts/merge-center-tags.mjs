// 대소문자·앞뒤 공백만 다른 '사실상 동일한' CenterTag를 하나로 병합한다.
// 실제 카드(Character/CharacterCollection)의 tags 배열에도 반영한다.
//
// 사용법:
//   node scripts/merge-center-tags.mjs           # 미리보기(dry-run) — 변경 안 함
//   node scripts/merge-center-tags.mjs --apply    # 실제 병합 수행
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function renameTagOnCards(from, to) {
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
  return chars.length + cols.length
}

async function main() {
  const tags = await prisma.centerTag.findMany({ orderBy: { createdAt: 'asc' } })

  const groups = new Map()
  for (const t of tags) {
    const key = t.name.trim().toLowerCase()
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }

  let mergedRows = 0
  let groupCount = 0

  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue
    groupCount++
    const canonical = [...group].sort((a, b) =>
      (a.category ? 0 : 1) - (b.category ? 0 : 1) ||
      (a.searchable ? 0 : 1) - (b.searchable ? 0 : 1) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0]

    const dups = group.filter(g => g.id !== canonical.id)
    console.log(`\n[병합] 대표 "${canonical.name}"  ← ${dups.map(d => `"${d.name}"`).join(', ')}`)

    for (const dup of dups) {
      if (APPLY) {
        const touched = await renameTagOnCards(dup.name, canonical.name)
        await prisma.centerTag.delete({ where: { id: dup.id } })
        console.log(`  "${dup.name}" → "${canonical.name}" (카드 ${touched}건 반영, 태그 행 삭제)`)
      } else {
        console.log(`  "${dup.name}" → "${canonical.name}" (예정)`)
      }
      mergedRows++
    }
  }

  console.log(`\n=== ${APPLY ? '완료' : '미리보기 (실제 변경 없음 — --apply로 실행)'} ===`)
  console.log(`중복 그룹: ${groupCount}개 · 병합${APPLY ? '됨' : ' 예정'} 태그: ${mergedRows}개`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
