// 동일 sourceUrl로 중복 저장된 CharacterCollection(센터 카드)을 정리한다.
// 안전 원칙: 대화에 실제로 사용 중인 중복은 건드리지 않고, 사용되지 않은 재import본만 삭제한다.
//
// 사용법:
//   node scripts/dedupe-collections.mjs           # 미리보기(dry-run) — 아무것도 삭제하지 않음
//   node scripts/dedupe-collections.mjs --apply    # 실제 삭제 수행
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function normalizeUrl(u) {
  if (!u) return ''
  try {
    const parsed = new URL(u.trim())
    parsed.hash = ''
    const s = parsed.toString()
    return s.endsWith('/') ? s.slice(0, -1) : s
  } catch {
    return u.trim().replace(/#.*$/, '').replace(/\/$/, '')
  }
}

async function usageCount(charIds) {
  if (charIds.length === 0) return 0
  const [asAi, asPersona] = await Promise.all([
    prisma.conversationCharacter.count({ where: { characterId: { in: charIds } } }),
    prisma.conversation.count({ where: { personaCharacterId: { in: charIds } } }),
  ])
  return asAi + asPersona
}

async function deleteCollection(col, charIds) {
  await prisma.$transaction(async (tx) => {
    if (charIds.length > 0) {
      await tx.conversationCharacter.deleteMany({ where: { characterId: { in: charIds } } })
      await tx.conversation.updateMany({ where: { personaCharacterId: { in: charIds } }, data: { personaCharacterId: null } })
      await tx.message.updateMany({ where: { characterId: { in: charIds } }, data: { characterId: null } })
      await tx.favorite.deleteMany({ where: { itemType: 'character', itemId: { in: charIds } } })
      await tx.character.deleteMany({ where: { id: { in: charIds } } })
    }
    await tx.favorite.deleteMany({ where: { itemType: 'collection', itemId: col.id } })
    await tx.characterCollection.delete({ where: { id: col.id } })
    if (col.conversationId) {
      const exists = await tx.conversation.findUnique({ where: { id: col.conversationId }, select: { id: true } })
      if (exists) await tx.conversation.delete({ where: { id: col.conversationId } })
    }
  })
}

async function main() {
  const cols = await prisma.characterCollection.findMany({
    select: {
      id: true, userId: true, sourceUrl: true, title: true, createdAt: true, conversationId: true,
      characters: { select: { id: true } },
    },
  })

  // (userId + 정규화 sourceUrl) 기준으로 그룹화
  const groups = new Map()
  for (const c of cols) {
    if (!c.sourceUrl) continue
    const key = `${c.userId}::${normalizeUrl(c.sourceUrl)}`
    const arr = groups.get(key) ?? []
    arr.push(c)
    groups.set(key, arr)
  }

  let deleted = 0, toDelete = 0, keptUsedDupes = 0, dupeGroups = 0

  for (const [key, arr] of groups) {
    if (arr.length < 2) continue
    dupeGroups++

    // 사용량 계산
    const enriched = []
    for (const c of arr) {
      const charIds = c.characters.map(ch => ch.id)
      enriched.push({ col: c, charIds, usage: await usageCount(charIds) })
    }

    // keeper 선정: 사용량 많은 순 → 캐릭터 많은 순 → 오래된 순
    enriched.sort((a, b) =>
      b.usage - a.usage ||
      b.charIds.length - a.charIds.length ||
      new Date(a.col.createdAt) - new Date(b.col.createdAt)
    )
    const keeper = enriched[0]
    const dupes = enriched.slice(1)

    console.log(`\n[중복] ${arr[0].sourceUrl}  (user ${arr[0].userId.slice(0, 8)}) — ${arr.length}개`)
    console.log(`  유지: "${keeper.col.title}" (캐릭터 ${keeper.charIds.length}, 사용 ${keeper.usage}, ${keeper.col.id.slice(0, 8)})`)

    for (const d of dupes) {
      if (d.usage > 0) {
        keptUsedDupes++
        console.log(`  보존(사용 중이라 건너뜀): "${d.col.title}" (사용 ${d.usage}, ${d.col.id.slice(0, 8)})`)
        continue
      }
      toDelete++
      console.log(`  삭제${APPLY ? '' : '(예정)'}: "${d.col.title}" (캐릭터 ${d.charIds.length}, ${d.col.id.slice(0, 8)})`)
      if (APPLY) {
        await deleteCollection(d.col, d.charIds)
        deleted++
      }
    }
  }

  console.log(`\n=== ${APPLY ? '완료' : '미리보기 (실제 삭제 안 함 — --apply로 실행)'} ===`)
  console.log(`중복 그룹: ${dupeGroups}개`)
  console.log(`삭제${APPLY ? '됨' : ' 예정'}: ${APPLY ? deleted : toDelete}건 · 사용 중이라 보존한 중복: ${keptUsedDupes}건`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
