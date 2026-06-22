// chub 기존 카드의 system_prompt 백필
// TavernCard(PNG)를 재다운로드해 system_prompt가 있으면 additionalInfo에 [시스템 설정] 섹션 추가.
// 이미 [시스템 설정]이 있으면 건너뜀.
// 실행: docker exec storyfit-web-1 node scripts/backfill-chub-system-prompt.mjs

import { PrismaClient } from '@prisma/client'
import { createRequire } from 'module'

const prisma = new PrismaClient()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const DELAY_MS = 500

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function parseChubUrl(url) {
  const m = url.match(/\/characters\/([^/]+)\/([^/?#]+)/i)
  if (!m) return null
  return { author: decodeURIComponent(m[1]), slug: decodeURIComponent(m[2]) }
}

// PNG 버퍼에서 chara_card_v2 JSON 추출 (tEXt 청크 파싱)
function parsePngTavernCard(buf) {
  try {
    // PNG 시그니처 확인
    if (buf[0] !== 0x89 || buf[1] !== 0x50) return null
    let offset = 8
    while (offset < buf.length - 12) {
      const len = buf.readUInt32BE(offset)
      const type = buf.slice(offset + 4, offset + 8).toString('ascii')
      if (type === 'tEXt') {
        const data = buf.slice(offset + 8, offset + 8 + len)
        const nullIdx = data.indexOf(0)
        if (nullIdx < 0) { offset += 12 + len; continue }
        const keyword = data.slice(0, nullIdx).toString('ascii')
        if (keyword === 'chara') {
          const b64 = data.slice(nullIdx + 1).toString('ascii')
          const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
          const card = json?.data ?? json
          return {
            name: card?.name ?? '',
            description: card?.description ?? '',
            personality: card?.personality ?? '',
            scenario: card?.scenario ?? '',
            first_mes: card?.first_mes ?? '',
            mes_example: card?.mes_example ?? '',
            system_prompt: card?.extensions?.depth_prompt?.prompt ?? card?.system_prompt ?? '',
            creator_notes: card?.creator_notes ?? '',
            alternate_greetings: card?.alternate_greetings ?? [],
            tags: card?.tags ?? [],
          }
        }
      }
      if (type === 'IEND') break
      offset += 12 + len
    }
    return null
  } catch { return null }
}

async function fetchCard(author, slug) {
  try {
    // node GET API의 definition 필드에서 system_prompt 추출
    const res = await fetch(`https://api.chub.ai/api/characters/${author}/${slug}?full=true`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const json = await res.json()
    const node = json?.node ?? json ?? {}
    const def = typeof node.definition === 'string' ? JSON.parse(node.definition) : (node.definition ?? {})
    const card = {
      system_prompt: (def?.system_prompt ?? '').trim(),
    }
    return { card }
  } catch (e) {
    return { error: e.message }
  }
}

async function main() {
  const cols = await prisma.characterCollection.findMany({
    where: { sourceUrl: { contains: 'chub' } },
    select: { id: true, title: true, sourceUrl: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`chub 컬렉션 ${cols.length}개`)

  let ok = 0, skipped = 0, noPrompt = 0, err = 0

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]
    const parsed = parseChubUrl(col.sourceUrl)
    if (!parsed) { console.log(`  ❌ [${i+1}] URL 파싱 실패: ${col.sourceUrl}`); err++; continue }
    const { author, slug } = parsed

    // 이미 처리된 카드 건너뜀
    const char = await prisma.character.findFirst({
      where: { collectionId: col.id },
      select: { id: true, additionalInfo: true },
    })
    if (!char) { console.log(`  · [${i+1}] 캐릭터 없음 — 건너뜀`); skipped++; continue }
    if (char.additionalInfo?.includes('[시스템 설정]')) {
      console.log(`  · [${i+1}/${cols.length}] ${col.title} — 이미 처리됨`)
      skipped++; continue
    }

    const result = await fetchCard(author, slug)
    if (result.error) {
      console.log(`  ❌ [${i+1}/${cols.length}] ${col.title} — ${result.error}`)
      err++
    } else {
      const sp = result.card.system_prompt?.trim() ?? ''
      if (!sp) {
        console.log(`  · [${i+1}/${cols.length}] ${col.title} — system_prompt 없음`)
        noPrompt++
      } else {
        const updated = (char.additionalInfo ?? '').trimEnd() + `\n\n[시스템 설정]\n${sp}`
        await prisma.character.update({
          where: { id: char.id },
          data: { additionalInfo: updated },
        })
        console.log(`  ✅ [${i+1}/${cols.length}] ${col.title} — system_prompt ${sp.length}자 추가`)
        ok++
      }
    }
    await sleep(DELAY_MS)
  }

  console.log(`\n완료: 추가=${ok} system_prompt없음=${noPrompt} 이미처리=${skipped} 오류=${err}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
