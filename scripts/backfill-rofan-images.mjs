// rofan 기존 카드에 relatedImages(공개 갤러리) 백필
// 실행: docker exec storyfit-web-1 node scripts/backfill-rofan-images.mjs
// 약 520개 × 300ms ≈ 3분 소요

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const DELAY_MS = 300

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try { return JSON.parse(m[1])?.props?.pageProps ?? null } catch { return null }
}

async function fetchRofanImages(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const pageProps = extractNextData(await res.text())
    if (!pageProps) return { error: 'no __NEXT_DATA__' }
    const bot = pageProps?.oriBotDetail ?? {}
    const charImage = bot.char_image ?? ''
    const publicAssets = Array.isArray(pageProps?.botAssets)
      ? pageProps.botAssets
          .filter(a => a?.status === 'public' && a?.image && !String(a.image).includes('/blur/'))
          .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
          .map(a => String(a.image).trim())
          .filter(Boolean)
      : []
    const relatedImages = publicAssets.filter(u => u !== charImage)
    return { relatedImages }
  } catch (e) {
    return { error: e.message }
  }
}

async function main() {
  // relatedImages 없는 rofan 카드만 처리
  const cols = await prisma.characterCollection.findMany({
    where: { sourceUrl: { contains: 'rofan.ai' } },
    select: { id: true, title: true, sourceUrl: true },
    orderBy: { createdAt: 'asc' },
  })

  // 이미 relatedImages가 있는 캐릭터 제외
  const needsBackfill = []
  for (const col of cols) {
    const ch = await prisma.character.findFirst({
      where: { collectionId: col.id },
      select: { id: true, relatedImages: true },
    })
    if (!ch) continue
    if (ch.relatedImages && ch.relatedImages.length > 0) continue
    needsBackfill.push({ col, charId: ch.id })
  }

  console.log(`처리 대상: ${needsBackfill.length}개 / 전체 ${cols.length}개`)

  let ok = 0, none = 0, err = 0
  for (let i = 0; i < needsBackfill.length; i++) {
    const { col, charId } = needsBackfill[i]
    const result = await fetchRofanImages(col.sourceUrl)
    if (result.error) {
      console.log(`  ❌ [${i+1}/${needsBackfill.length}] ${col.title} — ${result.error}`)
      err++
    } else if (result.relatedImages.length === 0) {
      none++
      if (i % 50 === 0) console.log(`  · [${i+1}/${needsBackfill.length}] ${col.title} — 이미지 없음`)
    } else {
      await prisma.character.update({
        where: { id: charId },
        data: { relatedImages: result.relatedImages },
      })
      console.log(`  ✅ [${i+1}/${needsBackfill.length}] ${col.title} — ${result.relatedImages.length}장`)
      ok++
    }
    await sleep(DELAY_MS)
  }

  console.log(`\n완료: 이미지저장=${ok} 없음=${none} 오류=${err}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
