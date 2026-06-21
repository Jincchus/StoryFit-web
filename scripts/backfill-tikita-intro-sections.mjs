// 기존 tikita 카드의 introHtml을 섹션별로 파싱해 tikitaMeta.introSections에 저장
// 실행: node scripts/backfill-tikita-intro-sections.mjs

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

function parseIntroSections(html) {
  if (!html?.trim()) return {}
  const sections = {}
  const parts = html.split(/<!--([\s\S]*?)-->/)
  let prevName = null
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (prevName !== null) {
        const text = stripHtml(parts[i]).trim()
        if (text) sections[prevName] = sections[prevName] ? sections[prevName] + '\n' + text : text
      }
    } else {
      prevName = parts[i].trim()
    }
  }
  return sections
}

async function main() {
  const cols = await prisma.characterCollection.findMany({
    where: { tikitaMeta: { not: null } },
    select: { id: true, title: true, tikitaMeta: true },
  })

  console.log(`tikita 컬렉션 ${cols.length}개 처리`)

  let updated = 0
  for (const col of cols) {
    const meta = col.tikitaMeta
    if (!meta) continue

    const introHtml = meta.introHtml ?? null
    const introSections = parseIntroSections(introHtml)
    const sectionCount = Object.keys(introSections).length

    console.log(`  [${col.title}] → ${sectionCount}개 섹션: ${Object.keys(introSections).join(', ') || '(없음)'}`)

    await prisma.characterCollection.update({
      where: { id: col.id },
      data: { tikitaMeta: { ...meta, introSections } },
    })
    updated++
  }

  console.log(`\n완료: ${updated}개 업데이트`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
