// 로판AI(rofan.ai) 국내 센터 가져오기.
// 캐릭터 페이지의 비로그인 SSR `__NEXT_DATA__` JSON(props.pageProps)에서 결정적으로 추출한다.
// 번역 불필요(한국어), 헤드리스·API키 불필요.
// 비설(char_secrets)만은 공개 페이지에 없어, 운영자 rofan_session_cookie가 있으면 CreateChat으로 보강한다.
import { prisma } from '@/lib/prisma'
import type { Captured, AssembledCharacter, AssembledResult } from './types'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const SITE = 'https://rofan.ai'

// rofan.ai 봇 상세(oriBotDetail) 중 우리가 쓰는 필드.
interface RofanBot {
  bot_id?: string
  char?: string
  char_image?: string
  char_persona?: string
  worldview?: string
  first_message?: string
  gender?: string
  creator_message?: string
  summary?: string
  nsfw?: boolean
  userPersona?: string
  char_secrets?: string // 비설(숨김 OOC 설정). 공개 페이지엔 없고 CreateChat 응답 botDetail에만 옴.
}
interface RofanTag { tag_name?: string }

const GENDER_MAP: Record<string, string> = { male: '남성', female: '여성' }

// rofan 설정 필드(char_persona/worldview/creator_message 등)는 <br>·<span>·<a> 같은 HTML을 담는다.
// <br>·블록 닫는 태그는 줄바꿈으로, 나머지 태그는 제거, 엔티티는 디코드한다.
// CreateChat 응답(char_secrets 등)은 유저 이름을 #FFC200 강조 <span>으로 박아 보내므로 {{user}}로 역치환한다.
function stripHtml(html?: string | null): string {
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

// URL에서 캐릭터 UUID 추출. 형식: rofan.ai/character/{uuid}
export function parseRofanUrl(url: string): string {
  const m = url.match(/\/character\/([0-9a-fA-F-]{36})/)
  if (!m) throw new Error('로판AI 캐릭터 URL이 아닙니다 (/character/{id} 형식 필요)')
  return m[1]
}

// HTML에서 __NEXT_DATA__ JSON 파싱 → pageProps 반환.
export function extractNextData(html: string): any {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('로판AI 페이지에서 데이터를 찾을 수 없습니다.')
  return JSON.parse(m[1])?.props?.pageProps ?? null
}

// pageProps → AssembledResult 조립(순수 함수, 테스트 대상).
export function assembleRofan(pageProps: any): AssembledResult {
  const bot: RofanBot = pageProps?.oriBotDetail ?? {}
  if (!bot.char?.trim()) throw new Error('로판AI 캐릭터 정보를 찾을 수 없습니다.')

  const tags: string[] = Array.isArray(pageProps?.botTags)
    ? (pageProps.botTags as RofanTag[]).map((t) => String(t?.tag_name ?? '').trim()).filter(Boolean)
    : []

  const persona = stripHtml(bot.char_persona)
  const world = stripHtml(bot.worldview)
  const secretSettings = stripHtml(bot.char_secrets) // 비설: 독립 필드(secretSettings)로 분리 — 카드·채팅 접힘 표시·프롬프트 포함.
  const userRole = stripHtml(bot.userPersona)
  const creatorMemo = stripHtml(bot.creator_message)
  const additionalInfo = [
    persona || undefined,
    world && `[세계관]\n${world}`,
    userRole && `[유저 역할]\n${userRole}`,
    creatorMemo && `[제작자 메모]\n${creatorMemo}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  // 갤러리(botAssets): status='public'인 공개 이미지만 수집. 'secret'(=대화중 해금, /blur/ 미리보기)은
  // 우리 쪽에서 원본을 볼 수 없으므로 제외한다. 대표 이미지(char_image)는 중복 제거.
  const publicAssets: string[] = Array.isArray(pageProps?.botAssets)
    ? (pageProps.botAssets as any[])
        .filter((a) => a?.status === 'public' && a?.image && !String(a.image).includes('/blur/'))
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
        .map((a) => String(a.image).trim())
        .filter(Boolean)
    : []
  const relatedImages = publicAssets.filter((u) => u !== bot.char_image)

  const character: AssembledCharacter = {
    name: bot.char.trim(),
    gender: GENDER_MAP[String(bot.gender)] ?? '',
    tags,
    additionalInfo,
    secretSettings: secretSettings || undefined,
    openingMessage: stripHtml(bot.first_message),
    exampleDialogues: '',
    avatarUrl: bot.char_image || publicAssets[0] || undefined,
    relatedImages: relatedImages.length > 0 ? relatedImages : undefined,
  }

  return {
    characters: [character],
    scenarioDescription: stripHtml(bot.summary),
    tags,
    title: character.name,
    safetyLevel: bot.nsfw ? 'relaxed' : 'standard',
    coverImageUrl: bot.char_image || undefined,
  }
}

// 비설(char_secrets) 보강: 공개 페이지엔 없고 CreateChat 응답 botDetail.char_secrets 에만 있다.
// 운영자 rofan_session_cookie 가 설정돼 있을 때만 시도. 실패/미설정 시 ''(=비설 없이 정상 import).
// ⚠️ CreateChat은 운영자 계정에 실제 대화방을 생성하는 부작용이 있다.
async function fetchRofanSecrets(botId: string): Promise<string> {
  const cfg = await prisma.globalConfig.findUnique({ where: { key: 'rofan_session_cookie' } })
  const raw = (cfg?.value ?? '').trim()
  if (!raw) return ''
  const cookie = raw.includes('=') ? raw : `__Secure-next-auth.session-token=${raw}`
  try {
    const sess = await fetch(`${SITE}/api/auth/session`, { headers: { Cookie: cookie, Accept: 'application/json' } })
    if (!sess.ok) return ''
    const userId = (await sess.json().catch(() => ({})))?.user?.id
    if (!userId) return ''
    const res = await fetch(`${SITE}/api/chat/CreateChat`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ bot_id: botId, userId }),
    })
    if (!res.ok) {
      console.log(`[rofan-import] char_secrets skip — CreateChat HTTP ${res.status}`)
      return ''
    }
    const data = await res.json().catch(() => ({}))
    return String(data?.botDetail?.char_secrets ?? '').trim()
  } catch (e) {
    console.log(`[rofan-import] char_secrets skip — ${e instanceof Error ? e.message : 'error'}`)
    return ''
  }
}

export async function captureRofan(url: string): Promise<Captured> {
  const uuid = parseRofanUrl(url)
  const res = await fetch(`${SITE}/character/${uuid}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
  })
  if (!res.ok) throw new Error(`로판AI 페이지 오류 (HTTP ${res.status})`)

  const pageProps = extractNextData(await res.text())
  const secrets = await fetchRofanSecrets(uuid)
  if (secrets && pageProps?.oriBotDetail) pageProps.oriBotDetail.char_secrets = secrets
  const assembledResult = assembleRofan(pageProps)
  const character = assembledResult.characters[0]

  console.log(`[rofan-import] ok — name=${character.name} tags=${character.tags?.length ?? 0} safety=${assembledResult.safetyLevel}`)

  return {
    sections: [],
    title: character.name,
    imageUrl: assembledResult.coverImageUrl ?? '',
    assembledResult,
  }
}
