// crack(crack.wrtn.ai) 스토리 가져오기.
// GET /crack-api/stories/{id} (스토리 상세) + /associated-characters (등장 캐릭터 목록)의
// 응답을 StoryFit 조립 결과(AssembledResult)로 변환하는 순수 함수.
import { prisma } from '@/lib/prisma'
import { withCrackPage } from '@/lib/crackBrowser'
import type { AssembledResult, AssembledCharacter } from './types'

interface AssembledOpening {
  id: string
  title: string
  content: string
}

// startingSets(스토리 도입부 목록) → 도입부 배열. 마크다운(**이름 |**, ![img](url))은 그대로 보존.
function buildOpenings(story: any): AssembledOpening[] {
  const sets = Array.isArray(story?.startingSets) ? story.startingSets : []
  return sets
    .map((s: any, i: number): AssembledOpening => ({
      id: String(i),
      title: String(s?.name ?? '').trim() || `도입부 ${i + 1}`,
      content: (Array.isArray(s?.initialMessages) ? s.initialMessages.join('\n\n') : '').trim(),
    }))
    .filter((o: AssembledOpening) => o.content)
}

// 캐릭터 프로필 이미지 → 공개 url. origin 우선, 없으면 w600.
function profileImageUrl(img: any): string | undefined {
  const url = String(img?.origin ?? img?.w600 ?? '').trim()
  return url || undefined
}

// API 응답(story + associatedCharacters) → AssembledResult (순수 함수, 테스트 대상).
// crackIds: result.characters와 병렬 인덱스로, 각 캐릭터의 crack 쪽 캐릭터 _id(재수집/업데이트용).
// associatedCharacters가 비어 있으면 대표 캐릭터 없이 스토리 자체를 캐릭터 1명으로 폴백한다.
export function assembleCrackStory(
  story: any,
  associatedCharacters: any[],
): { result: AssembledResult; crackIds: string[] } {
  const title = String(story?.name ?? '').trim()
  if (!title) throw new Error('크랙 스토리 정보를 찾을 수 없습니다.')

  const scenarioDescription =
    String(story?.detailDescription ?? '').trim() ||
    String(story?.description ?? '').trim() ||
    String(story?.simpleDescription ?? '').trim() ||
    ''

  const tags = Array.isArray(story?.tags) && story.tags.every((t: any) => typeof t === 'string')
    ? story.tags
    : []

  const coverImageUrl =
    String(story?.portraitImage?.origin ?? '').trim() ||
    String(story?.portraitImage?.w600 ?? '').trim() ||
    String(story?.profileImage?.origin ?? '').trim() ||
    undefined

  const safetyLevel = story?.isAdult ? 'relaxed' : 'standard'

  const openings = buildOpenings(story)
  const representativeComment = String(story?.representativeComment?.content ?? '').trim()

  const list = Array.isArray(associatedCharacters) ? associatedCharacters : []

  let characters: AssembledCharacter[]
  let crackIds: string[]

  if (list.length === 0) {
    // 등장 캐릭터 데이터가 없으면 스토리 자체를 대표 캐릭터 1명으로 취급.
    const additionalInfo = representativeComment || scenarioDescription
    characters = [
      {
        name: title.slice(0, 100),
        gender: '',
        tags: [],
        additionalInfo,
        exampleDialogues: '',
        openingMessage: openings[0]?.content ?? '',
        openingMessages: openings.length > 1 ? openings : undefined,
        avatarUrl: coverImageUrl,
      },
    ]
    crackIds = ['']
  } else {
    characters = list.map((c: any, i: number): AssembledCharacter => {
      const additionalInfoBase = String(c?.simpleDescription ?? '').trim()
      const isFirst = i === 0
      const additionalInfo = isFirst
        ? [representativeComment, additionalInfoBase].filter(Boolean).join('\n\n')
        : additionalInfoBase

      const char: AssembledCharacter = {
        name: String(c?.name ?? '').trim().slice(0, 100),
        gender: '',
        tags: [],
        additionalInfo,
        exampleDialogues: '',
        openingMessage: '',
        avatarUrl: profileImageUrl(c?.profileImage),
      }

      if (isFirst) {
        char.openingMessage = openings[0]?.content ?? ''
        if (openings.length > 1) char.openingMessages = openings
      }

      return char
    })
    crackIds = list.map((c: any) => String(c?._id ?? '').trim())
  }

  const result: AssembledResult = {
    characters,
    scenarioDescription,
    tags,
    title,
    safetyLevel,
    coverImageUrl,
  }

  return { result, crackIds }
}

async function getConfig(key: string): Promise<string> {
  const c = await prisma.globalConfig.findUnique({ where: { key } })
  return c?.value?.trim() ?? ''
}

// 스토리 상세 URL(https://crack.wrtn.ai/detail/{id}) · 스토리 API 경로(/stories/{id}/...) ·
// 단축 공유 링크(share.crack.wrtn.ai/xxx)를 모두 받아 24-hex mongo storyId를 뽑아낸다.
// 공유 링크는 리다이렉트를 따라가야 하는 별도 id 체계라 여기서는 지원하지 않고,
// URL 안에 이미 박힌 24-hex id(또는 bare id 입력)만 매칭한다.
export function parseCrackStoryId(url: string): string {
  const trimmed = url.trim()
  const patterns = [/\/detail\/([0-9a-f]{24})/i, /\/stories\/([0-9a-f]{24})/i]
  for (const re of patterns) {
    const m = trimmed.match(re)
    if (m) return m[1]
  }
  if (/^[0-9a-f]{24}$/i.test(trimmed)) return trimmed
  throw new Error('크랙 스토리 URL이 아닙니다 (/detail/{id} 형식 필요)')
}

// 저장된 "Cookie:" 헤더 문자열(k=v; k=v; ...)을 puppeteer page.setCookie용 객체로 변환.
// 빈 쌍은 건너뛴다.
function parseCrackCookies(cookieHeader: string): { name: string; value: string; domain: string; path: string }[] {
  const cookies: { name: string; value: string; domain: string; path: string }[] = []
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=')
    if (idx < 0) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    if (!name) continue
    cookies.push({ name, value, domain: '.wrtn.ai', path: '/' })
  }
  return cookies
}

// crack은 Cloudflare 뒤에 있어 서버 측 plain fetch는 리셋된다(리버스 엔지니어링 실측 확인) —
// 헤드리스 브라우저에 세션 쿠키를 주입하고, 브라우저 컨텍스트(page.evaluate) 안에서
// crack-api를 호출해 Cloudflare 통과 + 쿠키 자동 첨부를 모두 만족시킨다.
// access_token은 Authorization: Bearer 헤더로도 함께 보낸다(belt-and-suspenders).
export async function captureCrackStory(url: string): Promise<{ story: any; associatedCharacters: any[] }> {
  const storyId = parseCrackStoryId(url)

  const cookieHeader = await getConfig('crack_session_cookie')
  if (!cookieHeader) throw new Error('크랙 세션 쿠키가 설정되지 않았습니다. 관리자 설정에서 입력하세요.')

  const cookies = parseCrackCookies(cookieHeader)
  const accessToken = cookies.find((c) => c.name === 'access_token')?.value ?? ''

  return withCrackPage(async (page) => {
    if (cookies.length > 0) await page.setCookie(...cookies)

    // Cloudflare clearance는 브라우저 컨텍스트에서 실제 페이지를 한 번 방문해야 확립된다.
    // 내비게이션이 느려 타임아웃하더라도(네트워크 idle 대기 없이 도메인 방문 자체는 이미
    // 이뤄졌을 수 있어) 캡처 전체를 실패시키지 않고 계속 진행한다.
    try {
      await page.goto('https://crack.wrtn.ai/', { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch {
      // 내비게이션 실패는 무시하고 아래 API 호출을 그대로 시도한다.
    }

    const base = 'https://crack-api.wrtn.ai/crack-api'
    const fetchJson = (path: string) =>
      page.evaluate(
        async (u: string, token: string) => {
          const r = await fetch(u, {
            headers: token
              ? { authorization: 'Bearer ' + token, accept: 'application/json' }
              : { accept: 'application/json' },
            credentials: 'include',
          })
          if (!r.ok) return { __error: r.status }
          return r.json()
        },
        `${base}${path}`,
        accessToken,
      )

    const storyRes: any = await fetchJson(`/stories/${storyId}`)
    if (storyRes?.__error) throw new Error(`크랙 스토리 조회 오류 (HTTP ${storyRes.__error})`)

    const charsRes: any = await fetchJson(`/stories/${storyId}/associated-characters`)

    const story = storyRes?.data
    if (!story || !story.name) throw new Error('크랙 스토리를 찾을 수 없습니다.')

    const associatedCharacters = Array.isArray(charsRes?.data?.characters) ? charsRes.data.characters : []

    return { story, associatedCharacters }
  })
}
