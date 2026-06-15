import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/adminAuth'
import { renameTagOnCards } from '@/lib/centerTags'

// 대소문자·앞뒤 공백만 다른 '사실상 동일한' 태그들을 하나로 병합한다.
export async function POST(req: NextRequest) {
  const _auth = await requireAdmin(req)
  if (_auth instanceof NextResponse) return _auth

  const tags = await prisma.centerTag.findMany({ orderBy: { createdAt: 'asc' } })

  const groups = new Map<string, typeof tags>()
  for (const t of tags) {
    const key = t.name.trim().toLowerCase()
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }

  let merged = 0
  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue
    // 대표: 카테고리가 지정된 것 → 노출 ON → 가장 오래된 것 순
    const canonical = [...group].sort((a, b) =>
      (a.category ? 0 : 1) - (b.category ? 0 : 1) ||
      (a.searchable ? 0 : 1) - (b.searchable ? 0 : 1) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0]

    for (const dup of group) {
      if (dup.id === canonical.id) continue
      await renameTagOnCards(dup.name, canonical.name)
      await prisma.centerTag.delete({ where: { id: dup.id } })
      merged++
    }
  }

  return NextResponse.json({ merged })
}
