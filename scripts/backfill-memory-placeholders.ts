// 일회용 백필: 기존 장기메모리(Memory.summary)에 박힌 {{user}}/{{char}} 등 플레이스홀더를
// 각 대화의 페르소나명·캐릭터명으로 치환한다. (저장 경로 수정 이전에 생성된 메모리 정리용)
// 임베딩은 재생성하지 않는다 — 치환은 의미가 거의 동일해 벡터 드리프트가 무시할 수준.
//
// 실행(호스트): DATABASE_URL을 localhost:5433로 지정해 tsx로 실행.
//   DATABASE_URL='postgresql://storyfit:****@localhost:5433/storyfit' npx tsx scripts/backfill-memory-placeholders.ts
import { prisma } from '../lib/prisma'
import { replacePlaceholders } from '../lib/systemPrompt'

async function main() {
  const memories = await prisma.memory.findMany({
    select: {
      id: true,
      summary: true,
      conversation: {
        select: {
          personaCharacter: { select: { name: true } },
          user: { select: { displayName: true } },
          characters: { select: { character: { select: { name: true } } } },
        },
      },
    },
  })

  let scanned = 0
  let changed = 0
  for (const m of memories) {
    scanned++
    if (!m.summary) continue
    const conv = m.conversation
    const personaName = conv?.personaCharacter?.name || conv?.user?.displayName || '나'
    const charNames = (conv?.characters ?? []).map((c) => c.character.name)
    const next = replacePlaceholders(m.summary, personaName, charNames)
    if (next !== m.summary) {
      await prisma.memory.update({ where: { id: m.id }, data: { summary: next } })
      changed++
    }
  }
  console.log(`[backfill-memory] scanned=${scanned} changed=${changed}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
