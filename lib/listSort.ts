export type SortOption = 'latest' | 'oldest' | 'alpha' | 'active' | 'random'

// 시드 기반 PRNG (같은 시드 → 같은 순서, 렌더 간 안정). 시드를 바꾸면 다시 섞인다.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sortByOption<T>(
  items: T[],
  sort: SortOption,
  getLabel: (item: T) => string,
  getCreatedAt: (item: T) => string,
  getActivity?: (item: T) => string,
  randomSeed = 0,
): T[] {
  const sorted = items.slice()
  if (sort === 'alpha') {
    sorted.sort((a, b) => getLabel(a).localeCompare(getLabel(b), 'ko'))
  } else if (sort === 'oldest') {
    sorted.sort((a, b) => getCreatedAt(a).localeCompare(getCreatedAt(b)))
  } else if (sort === 'active') {
    const act = getActivity ?? getCreatedAt
    sorted.sort((a, b) => act(b).localeCompare(act(a)))
  } else if (sort === 'random') {
    // 시드 기반 Fisher-Yates 셔플 (시드 고정 시 순서 유지)
    const rng = mulberry32(randomSeed || 1)
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
    }
  } else {
    // latest
    sorted.sort((a, b) => getCreatedAt(b).localeCompare(getCreatedAt(a)))
  }
  return sorted
}
