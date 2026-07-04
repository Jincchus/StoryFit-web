// rofan 비밀설정(char_secrets) 붙여넣기 추출기 — 클라이언트 안전(순수 함수, 서버 의존 없음).
//
// 배경: rofan은 char_secrets(숨김 OOC/시스템 프롬프트)를 리스트/모달 데이터에만 실어 주고,
// 서버(데이터센터 IP)로 직접 요청하면 봇 탐지로 제거된 "라이트" 응답만 준다(context/rofan-parity.md).
// 그래서 서버 자동 수집은 불가 — 사용자가 본인 브라우저에서 캡처한 JSON을 붙여넣으면
// 여기서 char_secrets만 추려 정리한다.
//
// 정리 규칙은 lib/import/rofan.ts의 stripHtml과 동일하게 유지한다(#FFC200 유저명 span → {{user}}).

function cleanRofanSecret(html: string): string {
  return String(html || '')
    .replace(/<span[^>]*#FFC200[^>]*>[\s\S]*?<\/span>/gi, '{{user}}')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function deepFindString(o: unknown, key: string, depth = 6): string | undefined {
  if (depth < 0 || !o || typeof o !== 'object') return undefined
  const rec = o as Record<string, unknown>
  if (typeof rec[key] === 'string') return rec[key] as string
  for (const v of Object.values(rec)) {
    const r = deepFindString(v, key, depth - 1)
    if (r !== undefined) return r
  }
  return undefined
}

function findCharSecrets(o: any): string | undefined {
  // 알려진 경로 우선(형식별): botDetail(CreateChat payload) → 단독 → __NEXT_DATA__ oriBotDetail
  const known = [
    o?.char_secrets,
    o?.botDetail?.char_secrets,
    o?.oriBotDetail?.char_secrets,
    o?.props?.pageProps?.oriBotDetail?.char_secrets,
    o?.pageProps?.oriBotDetail?.char_secrets,
  ]
  for (const p of known) if (typeof p === 'string' && p.trim()) return p
  // 못 찾으면 어느 깊이든 char_secrets 키 탐색(포맷이 조금 달라도 대응)
  const found = deepFindString(o, 'char_secrets')
  return found && found.trim() ? found : undefined
}

export type RofanSecretResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'bad_json' | 'no_secret' | 'empty_after_clean' }

// 붙여넣은 텍스트에서 비밀설정을 추출해 정리한다.
// 지원: CreateChat payload({botDetail:{char_secrets}}), botDetail 단독({char_secrets}),
//       __NEXT_DATA__ 통째({props:{pageProps:{oriBotDetail:{char_secrets}}}}), 정리 전 원문 텍스트.
export function extractRofanSecret(pasted: string): RofanSecretResult {
  const text = (pasted ?? '').trim()
  if (!text) return { ok: false, reason: 'empty' }

  let raw: string | undefined
  const looksJson = text.startsWith('{') || text.startsWith('[')
  if (looksJson) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return { ok: false, reason: 'bad_json' }
    }
    raw = findCharSecrets(parsed)
    if (raw === undefined) return { ok: false, reason: 'no_secret' }
  } else {
    // JSON이 아니면 비밀설정 원문을 직접 붙여넣은 것으로 간주
    raw = text
  }

  const cleaned = cleanRofanSecret(raw)
  if (!cleaned) return { ok: false, reason: 'empty_after_clean' }
  return { ok: true, value: cleaned }
}
