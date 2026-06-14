import type { TagGroup } from '@/components/ui/TagFilterBar'

export interface CenterTagConfig {
  tags: { name: string; category: string | null; searchable: boolean }[]
  categories: string[]
}

const ETC = '기타'

export function buildTagGroups(itemTags: string[], config: CenterTagConfig | null): TagGroup[] {
  const present = new Set<string>()
  for (const t of itemTags) { const n = t.trim(); if (n) present.add(n) }
  if (present.size === 0) return []

  const hidden = new Set<string>()
  const catByName = new Map<string, string | null>()
  if (config) {
    for (const t of config.tags) {
      catByName.set(t.name, t.category)
      if (!t.searchable) hidden.add(t.name)
    }
  }

  const byCat = new Map<string, string[]>()
  for (const name of Array.from(present)) {
    if (hidden.has(name)) continue
    const cat = catByName.get(name) ?? ETC
    const arr = byCat.get(cat) ?? []
    arr.push(name)
    byCat.set(cat, arr)
  }

  const order = [...(config?.categories ?? []), ETC]
  const groups: TagGroup[] = []
  for (const cat of order) {
    const arr = byCat.get(cat)
    if (arr && arr.length) groups.push({ category: cat, tags: arr.sort() })
  }
  return groups
}
