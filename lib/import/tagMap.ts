// Chub 등 영문 센터 태그를 국내 센터 한글 태그 체계로 정규화한다.
// 1) 로컬 매핑 우선(표기 흔들림 방지) → 2) 미정의 태그만 번역 폴백(translate.ts)
// 키는 소문자로 비교한다. 값이 '' 이면 의미 없는 태그로 보고 버린다.
const TAG_MAP: Record<string, string> = {
  // 성별/관계
  female: '여성',
  male: '남성',
  'gender bender': '성전환',
  // 장르
  fantasy: '판타지',
  'sci-fi': 'SF',
  scifi: 'SF',
  'science fiction': 'SF',
  horror: '공포',
  romance: '로맨스',
  comedy: '코미디',
  drama: '드라마',
  action: '액션',
  adventure: '모험',
  mystery: '미스터리',
  slice_of_life: '일상',
  'slice of life': '일상',
  historical: '시대물',
  modern: '현대',
  // 캐릭터 아키타입 (이미 한국서 음차 통용)
  tsundere: '츤데레',
  yandere: '얀데레',
  kuudere: '쿨데레',
  dandere: '단데레',
  // 톤/속성
  wholesome: '훈훈한',
  'slow burn': '느린전개',
  dominant: '지배적',
  submissive: '순종적',
  // 출처/형식 — 식별 가치 낮아 폐기
  oc: '오리지널',
  rpg: 'RPG',
  anime: '애니',
  game: '게임',
}

// 매핑 적용. 반환은 { resolved: 확정된 한글 태그, unresolved: 번역이 필요한 원문 태그 }
export function applyTagMap(tags: string[]): { resolved: string[]; unresolved: string[] } {
  const resolved: string[] = []
  const unresolved: string[] = []
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    const mapped = TAG_MAP[t.toLowerCase()]
    if (mapped === undefined) unresolved.push(t)
    else if (mapped) resolved.push(mapped)
    // mapped === '' 이면 폐기
  }
  return { resolved, unresolved }
}

// 최종 정리: dedup + 공백 제거 + 최대 15개(타 센터 관행)
export function finalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const v = t.trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= 15) break
  }
  return out
}
