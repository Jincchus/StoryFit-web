// 센터 카드(컬렉션)를 카드 안 캐릭터들의 성별로 분류한다.
// 성별 원시값이 지저분(GENDER_MALE·남성·남자 / GENDER_FEMALE·여성 / 빈값)해 버킷으로 정규화한다.

export type GenderBucket = 'male' | 'female' | 'multi' | 'none'

export const CARD_GENDER_LABEL: Record<GenderBucket, string> = {
  male: '남성',
  female: '여성',
  multi: '멀티',
  none: '미분류',
}

// 단일 성별값 → male/female/none. ⚠️ 'female'이 'male'을 부분 포함하므로 female을 먼저 검사.
export function genderBucket(g?: string | null): 'male' | 'female' | 'none' {
  const s = (g ?? '').toLowerCase()
  if (s.includes('female') || s.includes('여')) return 'female'
  if (s.includes('male') || s.includes('남')) return 'male'
  return 'none'
}

// 카드(컬렉션) 단위 버킷: 캐릭터가 2명 이상이면 'multi', 1명이면 그 성별, 없으면 'none'.
export function cardGenderBucket(characters?: { gender?: string | null }[]): GenderBucket {
  if (!characters || characters.length === 0) return 'none'
  if (characters.length > 1) return 'multi'
  return genderBucket(characters[0].gender)
}

// 주어진 카드 목록에서 실제로 존재하는 버킷만 카운트와 함께 반환(필터 옵션 노출용).
export function availableGenderBuckets(
  cards: { characters?: { gender?: string | null }[] }[]
): { key: GenderBucket; label: string; count: number }[] {
  const counts = new Map<GenderBucket, number>()
  for (const c of cards) {
    const b = cardGenderBucket(c.characters)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  return (['male', 'female', 'multi', 'none'] as GenderBucket[])
    .filter(b => counts.has(b))
    .map(b => ({ key: b, label: CARD_GENDER_LABEL[b], count: counts.get(b)! }))
}
