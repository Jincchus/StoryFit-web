export type SortOption = 'latest' | 'oldest' | 'alpha' | 'active'

export function sortByOption<T>(
  items: T[],
  sort: SortOption,
  getLabel: (item: T) => string,
  getCreatedAt: (item: T) => string,
  getActivity?: (item: T) => string,
): T[] {
  const sorted = items.slice()
  if (sort === 'alpha') {
    sorted.sort((a, b) => getLabel(a).localeCompare(getLabel(b), 'ko'))
  } else if (sort === 'oldest') {
    sorted.sort((a, b) => getCreatedAt(a).localeCompare(getCreatedAt(b)))
  } else if (sort === 'active') {
    const act = getActivity ?? getCreatedAt
    sorted.sort((a, b) => act(b).localeCompare(act(a)))
  } else {
    // latest
    sorted.sort((a, b) => getCreatedAt(b).localeCompare(getCreatedAt(a)))
  }
  return sorted
}
