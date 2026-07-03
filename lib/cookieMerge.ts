// 서버가 Set-Cookie로 갱신해주는 쿠키(예: 세션 JWT)는 보통 일부(1~2개)뿐이고,
// 나머지(분석/추적 쿠키 등)는 최초 캡처 시점에만 존재한다. 갱신분으로 전체를
// 덮어쓰면 그 나머지가 영구 유실되므로, 이름 기준으로 병합해야 한다.
export function mergeCookieString(existing: string, refreshedPairs: string[]): string {
  const map = new Map<string, string>()
  for (const pair of existing.split(';').map(s => s.trim()).filter(Boolean)) {
    const i = pair.indexOf('=')
    if (i < 0) continue
    map.set(pair.slice(0, i), pair.slice(i + 1))
  }
  for (const pair of refreshedPairs) {
    const i = pair.indexOf('=')
    if (i < 0) continue
    map.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
