import puppeteer from 'puppeteer-core'
import { prisma } from '@/lib/prisma'
import { withMeltingPage } from '@/lib/meltingBrowser'
import type { Captured } from './types'
import { buildZetaCaptured, extractZetaLorebookEntries } from './zeta'

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
async function getGlobalConfigValue(
  key: 'whif_session_cookie' | 'melting_session_cookie' | 'melting_session_nickname'
): Promise<string> {
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

    const sessionCookie = await getGlobalConfigValue('whif_session_cookie')
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

    const universeIdFromUrl = url.match(/\/universes\/([^/?#]+)/)?.[1]

    const activeWhifFetch = async (uniId: string) => {
      try {
        const uniResult = await page.evaluate(async (id) => {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          try {
            const raw = localStorage.getItem('sb-beizfkcdgqkvhqcqvtwk-auth-token')
            const token = raw ? JSON.parse(raw)?.access_token : null
            if (token) headers['Authorization'] = `Bearer ${token}`
          } catch {}
          const res = await fetch('https://whif-gateway-298335711332.asia-northeast3.run.app/whif.bff.v1.UniverseService/GetUniverse', {
            method: 'POST',
            headers,
            body: JSON.stringify({ id })
          })
          return res.json()
        }, uniId)
        if (uniResult?.universe) {
          apiData.universe = uniResult.universe
          console.log('[whif-import] universe fetch:', uniResult.universe.name)
        } else {
          console.error('[whif-import] universe fetch returned no universe:', JSON.stringify(uniResult)?.slice(0, 300))
        }
      } catch (e: any) {
        console.error('[whif-import] universe fetch failed:', e.message)
      }
      try {
        const charsResult = await page.evaluate(async (id) => {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          try {
            const raw = localStorage.getItem('sb-beizfkcdgqkvhqcqvtwk-auth-token')
            const token = raw ? JSON.parse(raw)?.access_token : null
            if (token) headers['Authorization'] = `Bearer ${token}`
          } catch {}
          const res = await fetch('https://whif-gateway-298335711332.asia-northeast3.run.app/whif.bff.v1.CharacterService/ListByUniverseId', {
            method: 'POST',
            headers,
            body: JSON.stringify({ universeId: id })
          })
          return res.json()
        }, uniId)
        if (charsResult?.characters) {
          apiData.universeCharacters = charsResult.characters
          console.log('[whif-import] universe characters count:', charsResult.characters.length)
        } else {
          console.error('[whif-import] characters fetch returned no characters:', JSON.stringify(charsResult)?.slice(0, 300))
        }
      } catch (e: any) {
        console.error('[whif-import] characters fetch failed:', e.message)
      }
    }

    if (universeIdFromUrl) {
      // 세계관 URL: 페이지 초기화 후 바로 active fetch
      await new Promise((r) => setTimeout(r, 1500))
      await activeWhifFetch(universeIdFromUrl)
    } else {
      // 캐릭터 URL: GetCharacter 응답 대기 후 active fetch
      const startTime = Date.now()
      while (Date.now() - startTime < 10000) {
        if (apiData.character) break
        await new Promise((r) => setTimeout(r, 500))
      }

      if (apiData.character) {
        const mainCharObj = apiData.character.character || apiData.character
        const uniId = mainCharObj.universeId || mainCharObj.universe?.id
        if (uniId) {
          await activeWhifFetch(uniId)
        }
        if (!apiData.universe && mainCharObj.universe) {
          apiData.universe = mainCharObj.universe
        }
      }
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

// 멜팅은 로그인 세션의 페르소나 닉네임으로 "{유저}" 같은 플레이스홀더를 실시간
// 치환해서 보여준다 (예: "허니" 계정으로 로그인하면 캐릭터 소개 속 플레이스홀더
// 자리에 "허니"가 그대로 박혀 캡처된다). 가져온 캐릭터를 다른 사용자도 그대로
// 쓸 수 있도록, 캡처 단계에서 닉네임을 StoryFit이 인식하는 범용 플레이스홀더
// ([유저] — replacePlaceholders 참고)로 되돌린다.
// 한글은 명사에 조사가 공백 없이 바로 붙으므로(예: "허니야", "허니의") 단어 경계
// 검사를 넣으면 정작 치환해야 할 자리를 못 찾는다 — 그래서 단순 부분일치 치환을
// 쓴다. 닉네임이 "허니"처럼 흔한 단어와 겹치면 무관한 문맥("허니버터" 등)도 같이
// 바뀔 수 있는데, 그 경우는 가져오기 후 직접 수정하는 편이 차라리 안전하다
// (반대로 false negative가 나면 닉네임 노출이 그대로 남아 더 큰 문제가 된다).
function depersonalizeNickname(text: string, nickname: string): string {
  const trimmed = nickname.trim()
  if (!trimmed) return text
  return text.split(trimmed).join('[유저]')
}

// 멜팅의 일부 "첫 장면" 미리보기는 <desc>묘사</desc><talk>대사</talk> 마크업으로 내려온다.
// StoryFit의 노벨체 렌더링(NovelText)은 이 태그를 모르므로, *묘사*(이탤릭)/"대사"(굵게)
// 컨벤션으로 변환해 일반 텍스트로 만든다.
function convertMeltingOpeningTags(text: string): string {
  const wrapLines = (inner: string, marker: '*' | '"') =>
    inner.split('\n').map(line => {
      const t = line.trim()
      if (!t) return ''
      return marker === '*' ? `*${t}*` : `"${t}"`
    }).join('\n')

  return text
    .replace(/<desc>([\s\S]*?)<\/desc>/g, (_, inner) => wrapLines(inner, '*'))
    .replace(/<talk>([\s\S]*?)<\/talk>/g, (_, inner) => wrapLines(inner, '"'))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 로그인 세션으로 캐릭터 페이지를 렌더링해 "상세 설명"/"첫 장면" 탭을 섹션으로 분리해 반환한다.
// 세션이 없거나 만료된 경우 로그인 게이트 문구가 포함되어 '세션 게이트' 예외를 던진다 — 호출 측에서 OG 메타로 폴백한다.
async function renderMeltingSections(url: string): Promise<{
  sections: { tab: string | null; text: string }[]
  apiData?: any
}> {
  return withMeltingPage(async (page) => {
    const apiData: { bot?: any; openings?: any[] } = {}

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
          if (Array.isArray(json.json?.openings)) {
            apiData.openings = json.json.openings
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
      const seedCookie = await getGlobalConfigValue('melting_session_cookie')
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
        apiData: { ...apiData.bot, openings: apiData.openings }
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

    const clickTab = (label: string) => page.evaluate((lbl: string) => {
      const target = Array.from(document.querySelectorAll('button, [role="tab"], a, div, span'))
        .find(el => el.children.length === 0 && el.textContent?.trim() === lbl)
      if (target) { (target as HTMLElement).click(); return true }
      return false
    }, label)
    const grabClean = async () => (await grabPanelText()).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

    // 패널의 "초기 활성 탭 = 상세 설명"이라고 가정하면 안 된다 — 캐릭터에 따라 페이지
    // 로드 시 기본 활성 탭이 "첫 장면"인 경우가 있다(청도현 케이스 실측: 두 섹션이
    // 전부 "첫 장면" 내용으로 중복 캡처되고 실제 "상세 설명"은 영영 못 가져옴, 첫
    // 캡처를 무조건 '상세 설명'으로 라벨링했기 때문). 두 탭 모두 명시적으로 클릭한
    // 뒤 캡처해야 라벨과 실제 내용이 어긋나지 않는다.
    const sections: { tab: string | null; text: string }[] = []
    for (const label of ['상세 설명']) {
      if (await clickTab(label)) {
        await new Promise(r => setTimeout(r, 1200))
        sections.push({ tab: '상세 설명', text: await grabClean() })
        break
      }
    }
    for (const label of ['첫 장면', '첫장면']) {
      if (await clickTab(label)) {
        await new Promise(r => setTimeout(r, 1200))
        sections.push({ tab: '첫 장면', text: await grabClean() })
        break
      }
    }
    // 둘 중 어느 탭 버튼도 못 찾았다면(탭 구조가 없는 페이지) 현재 보이는 패널을 그대로 사용
    if (sections.length === 0) sections.push({ tab: '상세 설명', text: await grabClean() })

    if (sections.some(s => s.text.includes(MELTING_LOGIN_GATE_TEXT))) throw new Error('세션 게이트')
    return { sections }
  })
}

export async function captureWhif(url: string): Promise<Captured> {
  const { rawText, apiData } = await renderWhifPageText(url)

  // API 가로채기에 성공한 경우 직접 AssembledResult 구성 (AI 분류기 패스)
  // 언세이프 캐릭터는 로그인 시에도 DOM에 "세이프 모드를 해제" 안내 문구가 남아있으므로
  // apiData가 있으면 게이트 체크보다 먼저 처리한다.
  // universe가 없는 단독 캐릭터도 character 데이터만으로 처리한다.
  if (apiData && (apiData.character || (apiData.universeCharacters?.length ?? 0) > 0)) {
    const normalizeChar = (c: any) => c?.character || c
    let mainChar: any
    let allChars: any[]

    if (apiData.character) {
      mainChar = normalizeChar(apiData.character)
      const otherRaw = apiData.universeCharacters || []
      const otherChars = otherRaw.map(normalizeChar).filter((c: any) => c && c.id !== mainChar.id)
      allChars = [mainChar, ...otherChars].filter(Boolean)
    } else {
      allChars = (apiData.universeCharacters || []).map(normalizeChar).filter(Boolean)
      mainChar = allChars[0]
    }

    const universe = apiData.universe?.universe || apiData.universe || {}

    const characters = allChars.map((c) => {
      const firstMessages = c.publicData?.firstMessages || c.firstMessages || []
      const recommendedOpenings = c.publicData?.recommendedOpenings || c.recommendedOpenings || []
      const openingMessage = firstMessages[0]?.text || ''
      const description = c.introduction || c.description || c.publicData?.description || ''


      const imgMap: Record<string, string> = {}
      if (Array.isArray(c.images)) {
        for (const img of c.images) {
          if (img.slug && img.imageUrl) {
            imgMap[img.slug] = img.imageUrl.replace(/\/[^/]+$/, '/public')
          }
        }
      }
      const resolveImg = (t: string) =>
        t.replace(/\{\{img::([^}]+)\}\}/g, (_, slug) => imgMap[slug] ? `{{img::${imgMap[slug]}}}` : '')

      let additionalInfo = [description, ...recommendedOpenings].filter(Boolean).join('\n\n')

      const roleInfo = [
        c.summary && `요약: ${c.summary}`,
        c.role && `역할: ${c.role}`,
        c.relationshipDescription && `관계: ${c.relationshipDescription}`
      ].filter(Boolean).join('\n')

      if (roleInfo) {
        additionalInfo = `${roleInfo}\n\n${additionalInfo}`
      }

      // 다중 도입부를 구조화된 배열로 저장 (텍스트 덤프 대신)
      const openingMessages = firstMessages
        .filter((m: any) => m.text)
        .map((m: any, idx: number) => ({
          id: String(m.id || `opening_${idx}`),
          title: String(m.title || (idx === 0 ? '기본 도입부' : `도입부 ${idx + 1}`)),
          content: resolveImg(String(m.text || '')),
        }))

      let relatedImages: string[] = []
      try {
        const relatedData = typeof c.relatedContentJson === 'string'
          ? JSON.parse(c.relatedContentJson)
          : (c.relatedContentJson ?? {})
        const items = Array.isArray(relatedData.items) ? relatedData.items : []
        relatedImages = items
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .filter((item: any) => item.url && (item.type === 'image' || item.type === 'video'))
          .map((item: any) => String(item.url))
      } catch {}

      return {
        name: c.name || '캐릭터',
        gender: c.gender || '',
        tags: Array.isArray(c.keywords) ? c.keywords : [],
        additionalInfo: resolveImg(additionalInfo),
        openingMessage: resolveImg(openingMessage),
        openingMessages: openingMessages.length > 1 ? openingMessages : undefined,
        exampleDialogues: '',
        avatarUrl: c.avatarUrl || '',
        relatedImages: relatedImages.length > 0 ? relatedImages : undefined,
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

    const uniId = universe.id || mainChar.universeId || mainChar.universe?.id
    const universeUrl = uniId ? `https://www.whif.io/universes/${uniId}` : undefined

    const assembledResult = {
      characters,
      scenarioDescription: universe.description || '',
      tags: universe.tags || [],
      title: universe.name || mainChar.name || '캐릭터',
      safetyLevel,
      coverImageUrl: universe.imageUrl || mainChar.avatarUrl || '',
    }

    return {
      sections: [],
      title: mainChar.name || '캐릭터',
      imageUrl: mainChar.avatarUrl || universe.imageUrl || '',
      universeUrl,
      assembledResult,
      lorebooks: lorebooks.length > 0 ? lorebooks : undefined,
    }
  }

  // API 추출 실패 시 기존의 텍스트 스크래핑 방식으로 후퇴
  if (rawText.includes(WHIF_LOGIN_GATE_TEXT)) {
    throw new Error('로그인이 필요한 콘텐츠(언세이프 캐릭터)라 가져올 수 없습니다')
  }
  const text = cleanWhifText(rawText).slice(0, INPUT_CAP)
  if (text.length < 100) throw new Error('Whif 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  return { sections: [{ tab: null, text }], title: '', imageUrl: '' }
}

export async function captureZeta(url: string): Promise<Captured> {
  const plotId = url.match(/\/plots\/([0-9a-f-]{36})/i)?.[1]
  if (!plotId) throw new Error('Zeta 플롯 URL이 아닙니다 (/plots/{id} 형식 필요)')

  const res = await fetch(`https://api.zeta-ai.io/v1/plots/${plotId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Zeta API 오류 (HTTP ${res.status})`)

  const plot = await res.json()
  if (!plot?.id) throw new Error('Zeta 플롯 데이터를 찾을 수 없습니다')

  const canonical = `https://zeta-ai.io/ko/plots/${plot.id}/profile`
  const captured = buildZetaCaptured(plot, canonical)

  const lorebooks = extractZetaLorebookEntries(plot)
  if (lorebooks.length > 0) {
    captured.lorebooks = lorebooks
  }

  captured.zetaMeta = {
    ...plot,
    interactionCount: 0,
  }

  return captured
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
  const nickname = await getGlobalConfigValue('melting_session_nickname')

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

      // Helper function to find property by candidate keys
      const getValueByKeys = (obj: any, keys: string[]) => {
        for (const k of keys) {
          if (obj[k] && typeof obj[k] === 'string' && obj[k].trim()) {
            return obj[k].trim()
          }
        }
        return ''
      }

      const rawOpeningMessage = getValueByKeys(apiData, [
        'opening', 'firstMessage', 'greeting', 'intro', 'introduction',
        'firstScene', 'openingMessage', 'startMessage'
      ]) || apiData.opening || ''

      const profile = getValueByKeys(apiData, [
        'profile', 'characterProfile', 'profileDescription', 'detailedDescription'
      ])

      const timeline = getValueByKeys(apiData, [
        'timeline', 'characterTimeline', 'timelineDescription', 'timelineSetting'
      ])

      const userSettings = getValueByKeys(apiData, [
        'userSetting', 'userSettings', 'userPersonaSetting', 'userPersonaSettings',
        'userPersona', 'userDefaultSetting', 'userDefaultSettings', 'userPersonaDescription'
      ])

      // "## !요약" 같은 "!"로 시작하는 마크다운 제목은 멜팅 자체 봇 명령어 안내(플랫폼 UI
      // 기능)로, 캐릭터 설정과 무관해 시스템 프롬프트에 넣을 필요가 없다 — 해당 제목부터
      // 끝까지 잘라낸다.
      let additionalInfo = (apiData.publicDescription || '').replace(/\n+#{1,6}[^\n!]*!\S[\s\S]*$/, '').trim()
      if (profile) {
        additionalInfo += `\n\n[캐릭터 프로필]\n${profile}`
      }
      if (timeline) {
        additionalInfo += `\n\n[타임라인]\n${timeline}`
      }
      if (userSettings) {
        additionalInfo += `\n\n[유저 기본 설정]\n${userSettings}`
      }

      // 멜팅 캐릭터 목소리(TTS) 정보가 있다면 상세설명에 보존
      if (apiData.voiceId || apiData.voiceName) {
        additionalInfo += `\n\n[음성 설정]\n- 목소리 이름: ${apiData.voiceName || '기본'}\n- 목소리 ID: ${apiData.voiceId || ''}`
        if (apiData.voiceProvider) {
          additionalInfo += `\n- 제공사: ${apiData.voiceProvider}`
        }
      }

      const cleanAdditionalInfo = depersonalizeNickname(additionalInfo, nickname)
      const cleanOpeningMessage = depersonalizeNickname(rawOpeningMessage, nickname)

      // 멜팅은 캐릭터당 여러 "첫 장면"(도입부)을 등록할 수 있다 — 전부 가져와 선택 가능한
      // 도입부 목록으로 저장한다 (WHIF의 openingMessages와 동일한 구조).
      // 잠긴(미해금) 도입부의 opening 필드는 실제 본문 뒤에 마스킹(█✶▌ 등)된 더미 텍스트가
      // 이어 붙어 있다 — previewByMode의 preview(마스킹 없는 앞부분)가 있으면 그걸 쓰고,
      // 기본 도입부처럼 preview가 없는 경우에만 opening 원문을 그대로 쓴다.
      const rawOpenings = Array.isArray(apiData.openings) ? apiData.openings : []
      const openingMessages = rawOpenings
        .map((o: any) => {
          const mode = o?.recommendedMode === 'chat' ? 'chat' : 'novel'
          const preview = o?.previewByMode?.[mode]?.preview ?? o?.previewByMode?.novel?.preview ?? o?.previewByMode?.chat?.preview
          return { ...o, opening: preview ?? o?.opening }
        })
        .filter((o: any) => typeof o?.opening === 'string' && o.opening.trim().length > 0)
        .map((o: any, idx: number) => ({
          id: String(o.id || `opening_${idx}`),
          title: String(o.title || (idx === 0 ? '기본 도입부' : `도입부 ${idx + 1}`)),
          content: depersonalizeNickname(convertMeltingOpeningTags(String(o.opening || '')), nickname),
        }))

      const isNsfw = apiData.nsfw || apiData.isNsfw || false
      const safetyLevel = isNsfw ? 'relaxed' : 'standard'

      const genderMap: Record<string, string> = { male: '남성', female: '여성' }

      const assembledResult = {
        characters: [
          {
            name: apiData.name || title || '캐릭터',
            gender: genderMap[apiData.gender] || '',
            additionalInfo: cleanAdditionalInfo,
            openingMessage: cleanOpeningMessage,
            openingMessages: openingMessages.length > 1 ? openingMessages : undefined,
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
        meltingMeta: {
          ...apiData,
          userSettings: userSettings ? depersonalizeNickname(userSettings, nickname) : '',
          profile: profile ? depersonalizeNickname(profile, nickname) : '',
          timeline: timeline ? depersonalizeNickname(timeline, nickname) : '',
          openingMessage: cleanOpeningMessage,
        },
      }
    }

    const total = sections.reduce((n, s) => n + s.text.length, 0)
    if (total >= 100) {
      return {
        sections: sections.map(s => ({ ...s, text: depersonalizeNickname(s.text, nickname) })),
        title, imageUrl,
      }
    }
  } catch (e: any) {
    console.log('[melting-import] 헤드리스 실패, OG 메타로 폴백:', e?.message)
  }

  if (ogDesc.length < 100) throw new Error('멜팅 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  return { sections: [{ tab: null, text: depersonalizeNickname(ogDesc, nickname) }], title, imageUrl }
}
