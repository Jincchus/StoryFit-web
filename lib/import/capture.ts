import puppeteer from 'puppeteer-core'
import { prisma } from '@/lib/prisma'
import { withMeltingPage } from '@/lib/meltingBrowser'
import type { Captured } from './types'

const INPUT_CAP = 40000  // 분류 출력이 작아져 입력 캡을 크게 상향 (잘림 방지)

// 언세이프(성인) 캐릭터는 비로그인 상태에서 "세이프 모드를 해제하고..." 안내 문구만 내려오고
// 실제 캐릭터 소개는 전송되지 않는다. 이 문구로 게이트 상태를 판별한다.
const WHIF_LOGIN_GATE_TEXT = '세이프 모드를 해제'

// 멜팅은 비로그인 상태로 앱(SPA)에 접근하면 캐릭터 페이지 자체가 로그인 게이트로 막힌다
// (og:description 974자 등 공유링크 미리보기용 정적 HTML만 비로그인으로 공개됨).
// 태그·"첫 장면" 같은 정보까지 가져오려면 로그인 세션 쿠키 주입이 필요하다.
const MELTING_LOGIN_GATE_TEXT = '캐릭터를 보려면 로그인이 필요합니다'

export function matchesHost(url: string, ...domains: string[]): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return domains.some(d => hostname === d || hostname.endsWith(`.${d}`))
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim())
}

function extractNextFlightText(html: string): string {
  const chunks: string[] = []
  const re = /self\.__next_f\.push\(\[1,("(?:(?:\\.|[^"\\])*)")\]\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(match[1]))
    } catch {
      // Ignore malformed chunks; the visible HTML fallback may still work.
    }
  }

  return stripHtml(chunks.join('\n'))
}

function cleanZetaText(text: string): string {
  let cleaned = text

  const profileIdx = cleaned.indexOf('추천 대화 프로필')
  if (profileIdx > 1200) {
    const prefix = cleaned.slice(0, profileIdx).split(/\s+/).slice(-80).join(' ')
    cleaned = `${prefix} ${cleaned.slice(profileIdx)}`
  }

  // 추천 콘텐츠/크리에이터 정보 이후는 불필요한 데이터
  const cutMarkers = ['크리에이터', '출시일', '마음에 들었다면', 'Creator', 'Release date']
  for (const marker of cutMarkers) {
    const idx = cleaned.indexOf(marker)
    if (idx > 300) { cleaned = cleaned.slice(0, idx); break }
  }

  // 사이트 로고명("제타"/"Zeta")이 맨 앞에 오면 제거
  return cleaned
    .replace(/^(제타|Zeta)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function preprocessZetaText(html: string): string {
  const visibleText = cleanZetaText(stripHtml(html))
  const flightText = cleanZetaText(extractNextFlightText(html))
  const text = visibleText.length >= 300 ? visibleText : flightText
  return text.slice(0, 12000)
}

function cleanWhifText(text: string): string {
  let cleaned = text

  const cutMarkers = ['크리에이터', '출시일', '마음에 들었다면', 'Creator', 'Release date']
  for (const marker of cutMarkers) {
    const idx = cleaned.indexOf(marker)
    if (idx > 300) { cleaned = cleaned.slice(0, idx); break }
  }

  return cleaned
    .replace(/^(윕|WHIF)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// WHIF/멜팅 세션 쿠키는 GlobalConfig(DB)에 저장해 관리자 페이지에서 즉시 갱신할 수 있게 한다.
// 환경변수 방식은 컨테이너 재배포가 있어야 반영되는데, 멜팅 세션은 약 30분마다 만료되어
// 사실상 갱신이 불가능했다 — DB 조회로 바꿔 재배포 없이 바로 반영되도록 한다.
async function getStoredSessionCookie(key: 'whif_session_cookie' | 'melting_session_cookie'): Promise<string> {
  const config = await prisma.globalConfig.findUnique({ where: { key } })
  return config?.value?.trim() ?? ''
}

function parseSessionCookies(cookieHeader: string, domain: string): {
  name: string
  value: string
  domain?: string
  url?: string
  path: string
  secure?: boolean
}[] {
  // __Host- 접두사 쿠키는 명세상 domain 속성을 가질 수 없음(Secure + Path=/ + 호스트 단독 필수).
  // domain을 생략하고 대신 url을 지정해야 setCookie가 내부적으로 호출하는 deleteCookie도
  // "url 또는 domain 필요" 요건을 만족해 "Invalid cookie fields" 오류 없이 주입된다.
  const baseUrl = `https://${domain.replace(/^\./, '')}`
  const cookies: { name: string; value: string; domain?: string; url?: string; path: string; secure?: boolean }[] = []
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=')
    if (idx < 0) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    if (!name) continue
    if (name.startsWith('__Host-')) cookies.push({ name, value, url: baseUrl, path: '/', secure: true })
    else if (name.startsWith('__Secure-')) cookies.push({ name, value, domain, path: '/', secure: true })
    else cookies.push({ name, value, domain, path: '/' })
  }
  return cookies
}

// WHIF는 클라이언트 렌더링 SPA라 서버가 응답하는 원본 HTML에는 캐릭터 정보가 없음
// (Zeta처럼 Next.js 스트리밍 데이터로 내려오지 않음). 헤드리스 브라우저로 JS를 실행시켜
// 렌더링된 DOM에서 텍스트를 읽어야 한다.
async function renderWhifPageText(url: string): Promise<{
  rawText: string
  apiData?: {
    character?: any
    universe?: any
    universeCharacters?: any[]
  }
}> {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')

    const apiData: { character?: any; universe?: any; universeCharacters?: any[] } = {}

    await page.setRequestInterception(true)
    page.on('request', (request) => {
      request.continue()
    })
    page.on('response', async (response) => {
      const respUrl = response.url()
      try {
        if (respUrl.includes('/whif.bff.v1.CharacterService/GetCharacter')) {
          const text = await response.text()
          const json = JSON.parse(text)
          if (json.character) apiData.character = json.character
        } else if (respUrl.includes('/whif.bff.v1.UniverseService/GetUniverse')) {
          const text = await response.text()
          const json = JSON.parse(text)
          if (json.universe) apiData.universe = json.universe
        } else if (respUrl.includes('/whif.bff.v1.CharacterService/ListByUniverseId')) {
          const text = await response.text()
          const json = JSON.parse(text)
          if (json.characters) apiData.universeCharacters = json.characters
        }
      } catch {}
    })

    const sessionCookie = await getStoredSessionCookie('whif_session_cookie')
    if (sessionCookie) {
      if (sessionCookie.includes('eyJ') || sessionCookie.startsWith('Bearer ')) {
        const token = sessionCookie.replace(/^Bearer\s+/i, '').trim()
        await page.goto('https://www.whif.io', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})
        await page.evaluate((tok) => {
          try {
            const payload = JSON.parse(atob(tok.split('.')[1]))
            const expiresAt = payload.exp || Math.floor(Date.now() / 1000) + 3600
            // Supabase JS v2: Session 객체를 currentSession 래퍼 없이 직접 저장한다.
            const sessionObj = {
              access_token: tok,
              token_type: 'bearer',
              expires_in: expiresAt - Math.floor(Date.now() / 1000),
              expires_at: expiresAt,
              refresh_token: '',
              user: {
                id: payload.sub,
                aud: 'authenticated',
                role: payload.role || 'authenticated',
                email: payload.email || '',
                phone: payload.phone || '',
                app_metadata: payload.app_metadata || {},
                user_metadata: payload.user_metadata || {},
                created_at: '',
              },
            }
            localStorage.setItem('sb-beizfkcdgqkvhqcqvtwk-auth-token', JSON.stringify(sessionObj))
          } catch (e) {
            console.error('Failed to set localStorage auth token:', e)
          }
        }, token)
      } else {
        await page.setCookie(...parseSessionCookies(sessionCookie, '.whif.io'))
      }
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    if (!matchesHost(page.url(), 'whif.io', 'whif.club')) {
      throw new Error('예상하지 못한 주소로 리다이렉트되었습니다.')
    }

    // 필수 API 응답이 도달할 때까지 최대 10초간 대기
    const startTime = Date.now()
    while (Date.now() - startTime < 10000) {
      if (apiData.character && apiData.universe) {
        break
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    await page.waitForFunction(
      () => document.body.innerText.replace(/\s+/g, ' ').trim().length > 150,
      { timeout: 10000 }
    ).catch(() => {})

    const rawText = await page.evaluate(() => document.body.innerText)
    return { rawText, apiData }
  } finally {
    await browser.close()
  }
}

function extractZetaIntroText(text: string, characterNames: string[]): string {
  const introIdx = text.lastIndexOf('인트로')
  if (introIdx < 0) return ''

  let intro = text.slice(introIdx + '인트로'.length).trim()
  for (const marker of ['크리에이터', '출시일', '마음에 들었다면', 'Creator', 'Release date']) {
    const idx = intro.indexOf(marker)
    if (idx > 0) { intro = intro.slice(0, idx).trim(); break }
  }

  for (const name of characterNames) {
    if (!name) continue
    const re = new RegExp(`^${escapeRegExp(name)}\\s+`)
    if (re.test(intro) && intro.replace(re, '').trim().length > 20) {
      intro = intro.replace(re, '').trim()
      break
    }
  }

  return intro.slice(0, 5000)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractLorebookUrls(html: string): { url: string; name: string }[] {
  const matches = Array.from(html.matchAll(/href="(\/(?:ko|en)\/lorebooks\/[a-f0-9-]+)"[^>]*>([^<]*)</g))
  const seen = new Set<string>()
  return matches.flatMap(m => {
    const url = `https://zeta-ai.io${m[1]}`
    const name = m[2]?.trim() || url
    if (seen.has(url)) return []
    seen.add(url)
    return [{ url, name }]
  })
}

function extractZetaPlotImage(html: string, url: string): string {
  const plotIdMatch = url.match(/\/plots\/([0-9a-f-]{36})/i)
  if (!plotIdMatch) return ''
  const re = new RegExp(`https://image\\.zeta-ai\\.io/plot-(?:intro|cover)-image/${escapeRegExp(plotIdMatch[1])}/[0-9a-f-]+\\.(?:jpe?g|png|webp)`, 'i')
  const match = html.match(re)
  return match ? match[0] : ''
}

function extractMetaContent(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
  ]
  for (const re of patterns) {
    const match = html.match(re)
    if (match) return decodeHtmlEntities(match[1])
  }
  return ''
}

function cleanMeltingTitle(title: string): string {
  return title.replace(/\s*-\s*멜팅\s*$/i, '').trim()
}

// 로그인 세션으로 캐릭터 페이지를 렌더링해 "상세 설명"/"첫 장면" 탭을 섹션으로 분리해 반환한다.
// 세션이 없거나 만료된 경우 로그인 게이트 문구가 포함되어 '세션 게이트' 예외를 던진다 — 호출 측에서 OG 메타로 폴백한다.
async function renderMeltingSections(url: string): Promise<{
  sections: { tab: string | null; text: string }[]
  apiData?: any
}> {
  return withMeltingPage(async (page) => {
    const apiData: { bot?: any } = {}

    await page.setRequestInterception(true)
    page.on('request', (request) => {
      request.continue()
    })
    page.on('response', async (response) => {
      const respUrl = response.url()
      if (respUrl.includes('/api/characters/')) {
        try {
          const text = await response.text()
          const json = JSON.parse(text)
          if (json.json?.bot) {
            apiData.bot = json.json.bot
          }
        } catch {}
      }
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // 리다이렉트로 인해 검증된 호스트(melting.chat)를 벗어났다면 중단 (SSRF 방지 심층 방어)
    if (!matchesHost(page.url(), 'melting.chat')) {
      throw new Error('예상하지 못한 주소로 리다이렉트되었습니다.')
    }

    // 영속 프로필(브라우저가 디스크에 보관하는 로그인 세션)이 비어있거나 끊긴 경우를 감지해,
    // 관리자 페이지에 저장해 둔 시드 쿠키로 즉석 재로그인을 시도한다 — 평소엔 영속 세션이
    // 활동만으로 계속 연장되므로 이 분기를 탈 일이 거의 없고, 세션이 끊긴 드문 경우에만
    // (그리고 시드 쿠키가 새로 입력돼 있을 때만) 자동 복구된다.
    await new Promise(r => setTimeout(r, 1500))
    const gatedAtStart = await page.evaluate(
      (gate) => document.body.innerText?.includes(gate) ?? false,
      MELTING_LOGIN_GATE_TEXT
    )
    if (gatedAtStart) {
      const seedCookie = await getStoredSessionCookie('melting_session_cookie')
      if (seedCookie) {
        console.log('[melting-import] 영속 세션이 끊긴 것으로 보임 — 저장된 시드 쿠키로 재로그인 시도')
        await page.setCookie(...parseSessionCookies(seedCookie, '.melting.chat'))
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await new Promise(r => setTimeout(r, 1500))
      }
    }

    // API 데이터 가로채기에 성공했다면 탭 대기/클릭 스크래핑 로직을 생략하고 즉시 반환
    if (apiData.bot) {
      return {
        sections: [
          { tab: '상세 설명', text: apiData.bot.publicDescription || '' },
          { tab: '첫 장면', text: apiData.bot.opening || '' }
        ],
        apiData: apiData.bot
      }
    }

    // 캐릭터 패널은 제작자 프로필 위에 모달로 늦게 렌더링되므로, 단순 텍스트 길이 조건은
    // 모달이 뜨기 전(제작자 프로필만 있는 상태)에 만족돼버려 아래 grabPanelText가 패널을
    // 못 찾고 노이즈 가득한 body 전체로 폴백하는 원인이 된다 — 탭 요소 등장을 직접 기다린다.
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('*')).some(
        el => el.children.length === 0 && /^(첫\s*장면|상세\s*설명)$/.test(el.textContent?.trim() || '')
      ),
      { timeout: 20000 }
    ).catch(() => {})

    // 캐릭터 페이지는 제작자 프로필(다른 캐릭터 목록 등) 위에 모달로 캐릭터 패널이 뜨는 구조라
    // body 전체를 긁으면 노이즈가 섞인다. "첫 장면"/"상세 설명" 탭에서 부모로 거슬러 올라가며
    // innerText 길이가 더는 늘지 않는(=형제 요소가 섞이기 직전) 가장 작은 컨테이너를 패널로 본다.
    const grabPanelText = () => page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))
      const tabEl: any = all.find(el => el.children.length === 0 && /^(첫\s*장면|상세\s*설명)$/.test(el.textContent?.trim() || ''))
      if (!tabEl) return document.body.innerText
      let cur: any = tabEl.parentElement
      while (cur && cur.parentElement) {
        const curLen = cur.innerText?.length || 0
        const parentLen = cur.parentElement.innerText?.length || 0
        if (curLen > 200 && parentLen > curLen * 1.5) return cur.innerText
        cur = cur.parentElement
      }
      return document.body.innerText
    })

    const sections: { tab: string | null; text: string }[] = []
    const detail = await grabPanelText()
    sections.push({ tab: '상세 설명', text: detail.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() })
    for (const label of ['첫 장면', '첫장면']) {
      const clicked = await page.evaluate((lbl: string) => {
        const target = Array.from(document.querySelectorAll('button, [role="tab"], a, div, span'))
          .find(el => el.children.length === 0 && el.textContent?.trim() === lbl)
        if (target) { (target as HTMLElement).click(); return true }
        return false
      }, label)
      if (clicked) {
        await new Promise(r => setTimeout(r, 1200))
        const scene = (await grabPanelText()).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
        sections.push({ tab: '첫 장면', text: scene })
        break
      }
    }
    if (sections.some(s => s.text.includes(MELTING_LOGIN_GATE_TEXT))) throw new Error('세션 게이트')
    return { sections }
  })
}

export async function captureWhif(url: string): Promise<Captured> {
  const { rawText, apiData } = await renderWhifPageText(url)
  if (rawText.includes(WHIF_LOGIN_GATE_TEXT)) {
    throw new Error('로그인이 필요한 콘텐츠(언세이프 캐릭터)라 가져올 수 없습니다')
  }

  // API 가로채기에 성공한 경우 직접 AssembledResult 구성 (AI 분류기 패스)
  if (apiData && apiData.character && apiData.universe) {
    const universe = apiData.universe
    const mainChar = apiData.character
    // ListByUniverseId는 메인 캐릭터 자신도 포함해 내려주므로, 그대로 합치면
    // 동일 캐릭터가 두 번 생성된다 — id가 같은 항목은 제외한다.
    const otherChars = (apiData.universeCharacters || []).filter((c: any) => !mainChar?.id || c?.id !== mainChar.id)

    const allChars = [mainChar, ...otherChars]

    const characters = allChars.map((c) => {
      const firstMessages = c.publicData?.firstMessages || []
      const recommendedOpenings = c.publicData?.recommendedOpenings || []
      const openingMessage = firstMessages[0]?.text || ''
      let additionalInfo = [c.description, ...recommendedOpenings].filter(Boolean).join('\n\n')

      const roleInfo = [
        c.summary && `요약: ${c.summary}`,
        c.role && `역할: ${c.role}`,
        c.relationshipDescription && `관계: ${c.relationshipDescription}`
      ].filter(Boolean).join('\n')

      if (roleInfo) {
        additionalInfo = `${roleInfo}\n\n${additionalInfo}`
      }

      if (firstMessages.length > 1) {
        const otherIntros = firstMessages.slice(1)
          .map((m: any) => `도입부: ${m.title}\n${m.text}`)
          .join('\n\n')
        additionalInfo += `\n\n[다른 시작 상황]\n${otherIntros}`
      }

      return {
        name: c.name || '캐릭터',
        gender: c.gender || '',
        additionalInfo,
        openingMessage,
        exampleDialogues: '',
      }
    })

    // WHIF Lorebook (Encyclopedia) 추출
    const lorebooks: { keyword: string[]; content: string; priority?: number }[] = []
    const whifEntries = universe.encyclopediaEntries || universe.encyclopedia || universe.knowledges || []
    if (Array.isArray(whifEntries)) {
      for (const entry of whifEntries) {
        const entryTitle = entry.title || entry.keyword || ''
        const entryContent = entry.content || entry.body || ''
        if (entryTitle && entryContent) {
          const keywords = Array.isArray(entry.keywords)
            ? entry.keywords
            : typeof entry.keywords === 'string'
              ? entry.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
              : [entryTitle]
          lorebooks.push({
            keyword: keywords.length > 0 ? keywords : [entryTitle],
            content: entryContent,
            priority: entry.priority || 0,
          })
        }
      }
    }

    const isNsfw = mainChar.isNsfw || mainChar.publicData?.isNsfw || universe.isNsfw || false
    const safetyLevel = isNsfw ? 'relaxed' : 'standard'

    const assembledResult = {
      characters,
      scenarioDescription: universe.description || '',
      tags: universe.tags || [],
      title: universe.name || mainChar.name || '캐릭터',
      safetyLevel,
    }

    return {
      sections: [],
      title: assembledResult.title,
      imageUrl: mainChar.avatarUrl || universe.imageUrl || '',
      assembledResult,
      lorebooks: lorebooks.length > 0 ? lorebooks : undefined,
    }
  }

  // API 추출 실패 시 기존의 텍스트 스크래핑 방식으로 후퇴
  const text = cleanWhifText(rawText).slice(0, INPUT_CAP)
  if (text.length < 100) throw new Error('Whif 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  return { sections: [{ tab: null, text }], title: '', imageUrl: '' }
}

export async function captureZeta(url: string): Promise<Captured> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5' },
  })
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)
  const html = await res.text()
  const loreUrls = extractLorebookUrls(html)
  const imageUrl = extractZetaPlotImage(html, url)
  const body = preprocessZetaText(html).slice(0, INPUT_CAP)
  if (body.length < 100) throw new Error('Zeta 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  const intro = extractZetaIntroText(body, [])
  const sections = intro
    ? [{ tab: '인트로', text: intro }, { tab: null, text: body }]
    : [{ tab: null, text: body }]
  return { sections, title: '', imageUrl, loreUrls: loreUrls.length ? loreUrls : undefined }
}

export async function captureMelting(url: string): Promise<Captured> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5' },
  })
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)
  const html = await res.text()
  const title = cleanMeltingTitle(extractMetaContent(html, 'og:title'))
  const imageUrl = extractMetaContent(html, 'og:image')
  const ogDesc = extractMetaContent(html, 'og:description').slice(0, INPUT_CAP)

  try {
    const { sections, apiData } = await renderMeltingSections(url)

    // API 데이터 가로채기에 성공한 경우 직접 AssembledResult 구성 (AI 분류기 패스)
    if (apiData) {
      const hashtags = (apiData.publicDescription || '').match(/#[^\s#]+/g) || []
      const nativeTags = Array.isArray(apiData.tags)
        ? apiData.tags
        : Array.isArray(apiData.hashtagList)
          ? apiData.hashtagList
          : []
      const tags = [...hashtags.map((t: string) => t.replace('#', '').trim()), ...nativeTags]
        .filter(Boolean)
        .slice(0, 15)

      // 멜팅 캐릭터 목소리(TTS) 정보가 있다면 상세설명에 보존
      let additionalInfo = apiData.publicDescription || ''
      if (apiData.voiceId || apiData.voiceName) {
        additionalInfo += `\n\n[음성 설정]\n- 목소리 이름: ${apiData.voiceName || '기본'}\n- 목소리 ID: ${apiData.voiceId || ''}`
        if (apiData.voiceProvider) {
          additionalInfo += `\n- 제공사: ${apiData.voiceProvider}`
        }
      }

      const isNsfw = apiData.nsfw || apiData.isNsfw || false
      const safetyLevel = isNsfw ? 'relaxed' : 'standard'

      const assembledResult = {
        characters: [
          {
            name: apiData.name || title || '캐릭터',
            gender: '',
            additionalInfo,
            openingMessage: apiData.opening || '',
            exampleDialogues: '',
          }
        ],
        scenarioDescription: apiData.publicTagline || '',
        tags,
        title: apiData.name || title || '캐릭터',
        safetyLevel,
      }

      return {
        sections: [],
        title: assembledResult.title,
        imageUrl: apiData.profileImagePath
          ? `https://image-gen.melting.chat/public_images/${apiData.profileImagePath}?s=lg`
          : imageUrl,
        assembledResult,
      }
    }

    const total = sections.reduce((n, s) => n + s.text.length, 0)
    if (total >= 100) {
      return {
        sections,
        title,
        imageUrl
      }
    }
  } catch (e: any) {
    console.log('[melting-import] 헤드리스 실패, OG 메타로 폴백:', e?.message)
  }

  if (ogDesc.length < 100) throw new Error('멜팅 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  return { sections: [{ tab: null, text: ogDesc }], title, imageUrl }
}
