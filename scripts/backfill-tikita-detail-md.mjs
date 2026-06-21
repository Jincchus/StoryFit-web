// 기존 tikita 카드의 detail_md·introHtmlText를 tikitaMeta에 추가
// 실행: docker exec storyfit-web-1 node scripts/backfill-tikita-detail-md.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TIKITA_BASE = process.env.TIKITA_API_BASE ?? 'https://auth.tikita.ai'
const TIKITA_ANON = process.env.TIKITA_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ2Fyd3psYmtvdml4dW5mcHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4ODE5NTcsImV4cCI6MjA3MTQ1Nzk1N30.pUYuSpHFRK3fLSii0IBFLVrAoj_wL2PVs8Gt7QLTIts'

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

    const shortId = meta.shortId
    if (!shortId) { console.log(`  [${col.title}] shortId 없음 — 건너뜀`); continue }

    // 이미 둘 다 있으면 스킵
    if (meta.detailMd !== undefined && meta.introHtmlText !== undefined) {
      console.log(`  [${col.title}] 이미 처리됨 — 건너뜀`); continue
    }

    try {
      const res = await fetch(
        `${TIKITA_BASE}/rest/v1/story_with_metrics?short_id=eq.${encodeURIComponent(shortId)}&select=detail_md,intro_html`,
        { headers }
      )
      if (!res.ok) { console.log(`  [${col.title}] HTTP ${res.status} — 건너뜀`); continue }
      const rows = await res.json()
      const s = Array.isArray(rows) ? rows[0] : null
      if (!s) { console.log(`  [${col.title}] 응답 없음 — 건너뜀`); continue }

      const detailMd = String(s.detail_md || '').trim()
      const introHtmlText = stripHtml(s.intro_html)

      await prisma.characterCollection.update({
        where: { id: col.id },
        data: { tikitaMeta: { ...meta, detailMd, introHtmlText } },
      })
      console.log(`  ✅ [${col.title}] detailMd=${detailMd.length}자 introHtmlText=${introHtmlText.length}자`)
    } catch (e) {
      console.log(`  ❌ [${col.title}] 오류: ${e.message}`)
    }
  }

  console.log('\n완료')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
