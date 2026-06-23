// 멜팅 세션 keep-alive: 쿠키 등록 시점부터 6시간, 1~30분 랜덤 간격으로 갱신.
// Next.js instrumentation.ts에서 서버 시작 시 1회 호출된다.
import { prisma } from '@/lib/prisma'

const SESSION_DURATION_MS = 6 * 60 * 60 * 1000   // 6시간
const MIN_INTERVAL_MS     = 1  * 60 * 1000        // 1분
const MAX_INTERVAL_MS     = 30 * 60 * 1000        // 30분

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
]

let timer: ReturnType<typeof setTimeout> | null = null

async function getConfig(key: string): Promise<string> {
  try {
    const c = await prisma.globalConfig.findUnique({ where: { key } })
    return c?.value?.trim() ?? ''
  } catch { return '' }
}

async function setConfig(key: string, value: string): Promise<void> {
  await prisma.globalConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
}

export function startMeltingSessionKeeper(): void {
  // 서버 시작 직후 DB가 준비되기 전일 수 있으므로 5초 후 첫 체크
  setTimeout(scheduleNext, 5_000)
}

export function restartMeltingSessionKeeper(): void {
  if (timer) { clearTimeout(timer); timer = null }
  scheduleNext()
}

async function scheduleNext(): Promise<void> {
  try {
    const [cookie, startedAt] = await Promise.all([
      getConfig('melting_session_cookie'),
      getConfig('melting_session_started_at'),
    ])

    if (!cookie || !startedAt) return

    const elapsed = Date.now() - Number(startedAt)
    if (elapsed > SESSION_DURATION_MS) {
      console.log('[melting-keeper] 6시간 경과 — keep-alive 종료')
      return
    }

    const remainMin = Math.round((SESSION_DURATION_MS - elapsed) / 60_000)
    const delayMs   = MIN_INTERVAL_MS + Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS))
    console.log(`[melting-keeper] 다음 갱신 ${Math.round(delayMs / 60_000)}분 후 (세션 남은 시간 ${remainMin}분)`)

    timer = setTimeout(async () => {
      await pingMelting(cookie)
      scheduleNext()
    }, delayMs)
  } catch (e) {
    console.error('[melting-keeper] 스케줄 오류:', e)
  }
}

async function pingMelting(cookie: string): Promise<void> {
  try {
    const ua  = UA_POOL[Math.floor(Math.random() * UA_POOL.length)]
    const res = await fetch('https://melting.chat/', {
      headers: {
        'User-Agent':      ua,
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
        'Cookie':          cookie,
        'Cache-Control':   'no-cache',
      },
      redirect: 'manual',
    })

    // 로그인 리다이렉트 → 세션 만료
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') ?? ''
      if (loc.includes('login') || loc.includes('signin') || loc.includes('auth')) {
        console.log('[melting-keeper] 세션 만료(로그인 리다이렉트) — keep-alive 중단')
        return
      }
    }

    // Set-Cookie 캡처
    const raw: string[] =
      typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie()
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*__Host-)/)

    const refreshed = raw
      .flatMap(h => h.split(/;\s*/))
      .map(h => h.trim())
      .filter(h => h.startsWith('__Host-melting_session'))

    if (refreshed.length > 0) {
      await setConfig('melting_session_cookie', refreshed.join('; '))
      console.log('[melting-keeper] 세션 쿠키 갱신 완료')
    } else {
      console.log('[melting-keeper] Set-Cookie 없음 — 현재 쿠키 유지')
    }
  } catch (e) {
    console.error('[melting-keeper] ping 실패:', e)
  }
}
