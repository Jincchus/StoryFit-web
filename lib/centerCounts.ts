// 센터 리스트의 상태별(진행 중/대기/완료) 갯수와 태그별 갯수를 계산한다.
// 필터/검색과 무관한 '전체' 기준 — 탭·태그 칩 옆 개요 배지에 쓴다.

export interface ViewCounts { active: number; waiting: number; completed: number }

// completed/started 플래그 기반 상태 카운트. (whif 캐릭터처럼 completed 판정이 다른 곳은
// isDone를 넘겨 커스터마이즈)
export function viewCounts<T extends { started?: boolean; completed?: boolean }>(
  items: T[],
  isDone: (item: T) => boolean = (i) => !!i.completed,
): ViewCounts {
  let active = 0, waiting = 0, completed = 0
  for (const it of items) {
    if (isDone(it)) completed++
    else if (it.started) active++
    else waiting++
  }
  return { active, waiting, completed }
}

// 태그별 등장 횟수.
export function tagCounts<T extends { tags?: string[] }>(items: T[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const it of items) {
    for (const t of it.tags ?? []) {
      const n = t.trim()
      if (n) m[n] = (m[n] ?? 0) + 1
    }
  }
  return m
}
