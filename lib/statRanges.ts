import type { StatEntry, StatRange } from '@/types'

// tikita variables의 range_description 파싱.
// 형식(구간마다 빈 줄로 구분되기도 함):
//   "-500 ~ -401 : 증오,{{char1}}은 ...\n\n-400 ~ -301 : 적대, ..."
// 음수·공백 편차·빈 줄 유무에 관대하게, 다음 "정수 ~ 정수 :" 경계까지를 한 구간으로 본다.
export function parseRangeStates(rangeDescription?: string | null): StatRange[] {
  const src = String(rangeDescription || '').trim()
  if (!src) return []
  const out: StatRange[] = []
  const re = /(-?\d+)\s*~\s*(-?\d+)\s*:\s*([\s\S]*?)(?=(?:-?\d+\s*~\s*-?\d+\s*:)|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const lo = parseInt(m[1], 10)
    const hi = parseInt(m[2], 10)
    const text = m[3].trim()
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !text) continue
    out.push({ lo: Math.min(lo, hi), hi: Math.max(lo, hi), text })
  }
  return out
}

// 현재 값에 해당하는 구간 서술을 반환. 구간을 벗어나면 가장 가까운 구간으로 보정.
export function activeRangeText(stat: Pick<StatEntry, 'value' | 'rangeStates'>): string | null {
  const ranges = stat.rangeStates
  if (!Array.isArray(ranges) || ranges.length === 0) return null
  const v = stat.value
  const hit = ranges.find(r => v >= r.lo && v <= r.hi)
  if (hit) return hit.text
  // 어떤 구간에도 안 맞으면(경계 겹침·공백) 값에서 가장 가까운 구간.
  let best = ranges[0]
  let bestDist = Infinity
  for (const r of ranges) {
    const dist = v < r.lo ? r.lo - v : v > r.hi ? v - r.hi : 0
    if (dist < bestDist) { bestDist = dist; best = r }
  }
  return best.text
}

// range_description 구간의 앞부분(라벨)만 뽑는다 — 예 "증오,{{char1}}은..." → "증오".
export function rangeLabel(text: string): string {
  const first = String(text || '').split(/[,\n]/)[0]?.trim() ?? ''
  return first.slice(0, 20)
}
