// 기존 tikita 카드의 introHtml에서 섹션 순서를 추출해 tikitaMeta.introSectionOrder에 저장
// jsonb가 object key를 알파벳 정렬하므로 순서를 배열로 별도 보존해야 한다.
// 실행: docker exec storyfit-web-1 node scripts/backfill-tikita-section-order.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TIKITA_BASE = process.env.TIKITA_API_BASE ?? 'https://auth.tikita.ai'
const TIKITA_ANON = process.env.TIKITA_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ2Fyd3psYmtvdml4dW5mcHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4ODE5NTcsImV4cCI6MjA3MTQ1Nzk1N30.pUYuSpHFRK3fLSii0IBFLVrAoj_wL2PVs8Gt7QLTIts'

function parseIntroSectionOrder(html) {
  if (!html?.trim()) return []
  const order = []
  const parts = html.split(/<!--([\s\S]*?)-->/)
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim()
    if (name && !order.includes(name)) order.push(name)
  }
  return order
}

async function main() {
  const cols = await prisma.characterCollection.findMany({
    where: { tikitaMeta: { not: null } },
    select: { id: true, title: true, tikitaMeta: true },
  })

  console.log(`tikita 컬렉션 ${cols.length}개 처리`)
  const headers = { apikey: TIKITA_ANON, Authorization: `Bearer ${TIKITA_ANON}`, Accept: 'application/json' }

  for (const col of cols) {
    const meta = col.tikitaMeta
    if (!meta) continue
    if (Array.isArray(meta.introSectionOrder)) { console.log(`  [${col.title}] 이미 처리됨 — 건너뜀`); continue }

    const introHtml = meta.introHtml ?? null
    let html = introHtml

    if (!html) {
      const shortId = meta.shortId
      if (!shortId) { console.log(`  [${col.title}] shortId 없음 — 건너뜀`); continue }
      try {
        const res = await fetch(
          `${TIKITA_BASE}/rest/v1/story_with_metrics?short_id=eq.${encodeURIComponent(shortId)}&select=intro_html`,
          { headers }
        )
        if (!res.ok) { console.log(`  [${col.title}] HTTP ${res.status}`); continue }
        const rows = await res.json()
        html = Array.isArray(rows) ? rows[0]?.intro_html ?? null : null
      } catch (e) { console.log(`  ❌ [${col.title}] ${e.message}`); continue }
    }

    const introSectionOrder = parseIntroSectionOrder(html)
    await prisma.characterCollection.update({
      where: { id: col.id },
      data: { tikitaMeta: { ...meta, introSectionOrder } },
    })
    console.log(`  ✅ [${col.title}] ${introSectionOrder.length}개: ${introSectionOrder.slice(0, 5).join(', ')}${introSectionOrder.length > 5 ? '...' : ''}`)
  }

  console.log('\n완료')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
