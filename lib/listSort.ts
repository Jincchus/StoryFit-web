export type SortOption = 'latest' | 'alpha'

export function sortByOption<T>(
  items: T[],
  sort: SortOption,
  getLabel: (item: T) => string,
  getCreatedAt: (item: T) => string,
): T[] {
  const sorted = items.slice()
  if (sort === 'alpha') {
    sorted.sort((a, b) => getLabel(a).localeCompare(getLabel(b), 'ko'))
  } else {
    sorted.sort((a, b) => getCreatedAt(b).localeCompare(getCreatedAt(a)))
  }
  return sorted
}
