// 기존 tikita 카드의 intro_html에서 섹션별 이미지를 추출해 tikitaMeta.introSectionImages에 저장
// 실행: docker exec storyfit-web-1 node scripts/backfill-tikita-section-images.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TIKITA_BASE = process.env.TIKITA_API_BASE ?? 'https://auth.tikita.ai'
const TIKITA_ANON = process.env.TIKITA_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ2Fyd3psYmtvdml4dW5mcHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4ODE5NTcsImV4cCI6MjA3MTQ1Nzk1N30.pUYuSpHFRK3fLSii0IBFLVrAoj_wL2PVs8Gt7QLTIts'

function storageUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${TIKITA_BASE}/storage/v1/object/public/${path.replace(/^\/+/, '')}`
}

function extractImgUrls(html) {
  const urls = []
  const re = /<img[^>]+src=["']([^"']+)["']/gi
  let m
  while ((m = re.exec(String(html || '')))) urls.push(m[1])
  return [...new Set(urls)]
}

function parseIntroSectionImages(html) {
  if (!html?.trim()) return {}
  const result = {}
  const parts = html.split(/<!--([\s\S]*?)-->/)
  let prevName = null
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (prevName !== null) {
        const imgs = extractImgUrls(parts[i]).map(u => storageUrl(u)).filter(Boolean)
        if (imgs.length > 0) result[prevName] = [...(result[prevName] ?? []), ...imgs]
      }
    } else {
      prevName = parts[i].trim()
    }
  }
  return result
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
    if (meta.introSectionImages !== undefined) { console.log(`  [${col.title}] 이미 처리됨 — 건너뜀`); continue }

    const introHtml = meta.introHtml ?? null
    if (!introHtml) {
      // introHtml 없으면 API에서 가져옴
      const shortId = meta.shortId
      if (!shortId) { console.log(`  [${col.title}] shortId 없음 — 건너뜀`); continue }
      try {
        const res = await fetch(
          `${TIKITA_BASE}/rest/v1/story_with_metrics?short_id=eq.${encodeURIComponent(shortId)}&select=intro_html`,
          { headers }
        )
        if (!res.ok) { console.log(`  [${col.title}] HTTP ${res.status}`); continue }
        const rows = await res.json()
        const s = Array.isArray(rows) ? rows[0] : null
        const html = s?.intro_html ?? null
        const introSectionImages = parseIntroSectionImages(html)
        await prisma.characterCollection.update({ where: { id: col.id }, data: { tikitaMeta: { ...meta, introSectionImages } } })
        const keys = Object.keys(introSectionImages)
        console.log(`  ✅ [${col.title}] (API) ${keys.join(', ') || '이미지 없음'}`)
      } catch (e) { console.log(`  ❌ [${col.title}] ${e.message}`) }
      continue
    }

    const introSectionImages = parseIntroSectionImages(introHtml)
    await prisma.characterCollection.update({ where: { id: col.id }, data: { tikitaMeta: { ...meta, introSectionImages } } })
    const keys = Object.keys(introSectionImages)
    console.log(`  ✅ [${col.title}] ${keys.join(', ') || '이미지 없음'}`)
  }

  console.log('\n완료')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
