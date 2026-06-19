// 로판AI(rofan.ai) 국내 센터 가져오기.
// 캐릭터 페이지의 비로그인 SSR `__NEXT_DATA__` JSON(props.pageProps)에서 결정적으로 추출한다.
// 번역 불필요(한국어), 헤드리스·쿠키·API키 불필요.
import type { Captured, AssembledCharacter, AssembledResult } from './types'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

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
}
interface RofanTag { tag_name?: string }

const GENDER_MAP: Record<string, string> = { male: '남성', female: '여성' }

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

  const additionalInfo = [
    bot.char_persona?.trim(),
    bot.worldview?.trim() && `[세계관]\n${bot.worldview.trim()}`,
    bot.creator_message?.trim() && `[제작자 메모]\n${bot.creator_message.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const character: AssembledCharacter = {
    name: bot.char.trim(),
    gender: GENDER_MAP[String(bot.gender)] ?? '',
    tags,
    additionalInfo,
    openingMessage: bot.first_message?.trim() ?? '',
    exampleDialogues: '',
    avatarUrl: bot.char_image || undefined,
  }

  return {
    characters: [character],
    scenarioDescription: bot.summary?.trim() ?? '',
    tags,
    title: character.name,
    safetyLevel: bot.nsfw ? 'relaxed' : 'standard',
    coverImageUrl: bot.char_image || undefined,
  }
}

export async function captureRofan(url: string): Promise<Captured> {
  const uuid = parseRofanUrl(url)
  const res = await fetch(`https://rofan.ai/character/${uuid}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
  })
  if (!res.ok) throw new Error(`로판AI 페이지 오류 (HTTP ${res.status})`)

  const pageProps = extractNextData(await res.text())
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
