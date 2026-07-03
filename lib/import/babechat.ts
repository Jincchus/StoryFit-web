// babechat(베이비챗) 국내 센터 가져오기.
// 캐릭터 데이터는 인증 API(api.babechatapi.com)에서만 받을 수 있어, 운영자 로그인 토큰을
// globalConfig에 저장해 사용한다. 액세스 토큰 만료(401/403) 시 refresh 토큰으로 자동 갱신.
// ⚠️ 본인 계정의 인증 접근(개인 사용). 토큰은 만료되며, 갱신 실패 시 관리자 설정에서 재입력.
import { prisma } from '@/lib/prisma'
import type { Captured, AssembledCharacter, AssembledResult } from './types'

const API = 'https://api.babechatapi.com/ko/api'

async function getConfig(key: string): Promise<string> {
  const c = await prisma.globalConfig.findUnique({ where: { key } })
  return c?.value?.trim() ?? ''
}
async function setConfig(key: string, value: string): Promise<void> {
  await prisma.globalConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
}

// URL에서 캐릭터 id 추출. 형식: babechat.ai/character/u/{uuid}/profile 또는 /characters/{uuid}.
// 커스텀 슬러그가 있는 캐릭터는 "u/" 없이 /character/{slug}/profile 로 오고, API도 슬러그를
// id 그대로 받는다(실측 확인) — UUID든 슬러그든 그대로 캡처한다.
export function parseBabechatUrl(url: string): string {
  const m = url.match(/\/characters?\/(?:u\/)?([0-9a-zA-Z-]+)/)
  if (!m) throw new Error('babechat 캐릭터 URL이 아닙니다 (/character/u/{id}/profile 형식 필요)')
  return m[1]
}

// 액세스 토큰 만료 시 refresh 토큰으로 새 액세스 토큰 발급 후 저장.
export async function refreshAccessToken(): Promise<string> {
  const refresh = await getConfig('babechat_refresh_token')
  if (!refresh) throw new Error('babechat 액세스 토큰이 만료되었습니다. 관리자 설정에서 토큰을 다시 입력하세요.')
  const res = await fetch(`${API}/auth/token/refresh?refresh_token=${encodeURIComponent(refresh)}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error('babechat 토큰 갱신 실패 — 관리자 설정에서 토큰을 다시 입력하세요.')
  const data = await res.json().catch(() => ({}))
  const access = data.accessToken || data.access_token || data.token || ''
  if (!access) throw new Error('babechat 토큰 갱신 응답에 액세스 토큰이 없습니다.')
  await setConfig('babechat_access_token', access)
  const newRefresh = data.refreshToken || data.refresh_token
  if (newRefresh) await setConfig('babechat_refresh_token', newRefresh)
  return access
}

async function fetchCharacter(id: string, token: string): Promise<Response> {
  return fetch(`${API}/characters/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
}

const GENDER_MAP: Record<string, string> = { male: '남성', female: '여성' }

// 도입부 본문의 인라인 이미지 토큰(img:[코드])을 제거한다.
// 토큰의 짧은 코드는 emotionImages/profileImages 키와 직접 매핑되지 않아, 평문으로 두면 "img:[xxx]"가 그대로 노출돼 깨진다.
function stripImgTokens(text: string): string {
  return text
    .replace(/img:\[[^\]]*\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 감정/추가 이미지 갤러리 → 공개 url 목록. profileImages(order·hidden 포함)를 우선,
// 없으면 emotionImages(키→url 맵)로 폴백. hidden:true는 제외, order로 정렬.
function galleryUrls(d: any): string[] {
  const out: { url: string; order: number }[] = []
  const pi = d?.profileImages
  if (pi && typeof pi === 'object') {
    for (const v of Object.values<any>(pi)) {
      if (v && typeof v === 'object' && !v.hidden && typeof v.url === 'string') {
        out.push({ url: v.url, order: Number(v.order ?? 0) })
      }
    }
  }
  if (out.length === 0 && d?.emotionImages && typeof d.emotionImages === 'object') {
    for (const u of Object.values<any>(d.emotionImages)) {
      if (typeof u === 'string') out.push({ url: u, order: 0 })
    }
  }
  return out
    .sort((a, b) => a.order - b.order)
    .map((x) => x.url)
    .filter((u) => /^https?:\/\//.test(u))
}

// API 응답 → AssembledResult (순수 함수, 테스트 대상).
export function assembleBabechat(d: any): AssembledResult {
  const name = String(d?.name ?? '').trim()
  if (!name) throw new Error('babechat 캐릭터 정보를 찾을 수 없습니다.')

  const cd = d.characterDetails ?? {}
  const details = String(cd.details ?? d.details ?? '').trim()
  const arr = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
  const attrs = [
    String(cd.date ?? d.date ?? '').trim() && `생일: ${String(cd.date ?? d.date).trim()}`,
    arr(cd.jobs ?? d.jobs).length ? `직업: ${arr(cd.jobs ?? d.jobs).join(', ')}` : '',
    String(cd.height ?? d.height ?? '').trim() && `키: ${String(cd.height ?? d.height).trim()}`,
    String(cd.weight ?? d.weight ?? '').trim() && `몸무게: ${String(cd.weight ?? d.weight).trim()}`,
    arr(cd.interests ?? d.interests).length ? `관심사: ${arr(cd.interests ?? d.interests).join(', ')}` : '',
    arr(cd.likes ?? d.likes).length ? `좋아하는 것: ${arr(cd.likes ?? d.likes).join(', ')}` : '',
    arr(cd.dislikes ?? d.dislikes).length ? `싫어하는 것: ${arr(cd.dislikes ?? d.dislikes).join(', ')}` : '',
    String(cd.location ?? d.location ?? '').trim() && `장소: ${String(cd.location ?? d.location).trim()}`,
  ].filter(Boolean)
  // details가 없으면 description(소개글)을 대신 사용
  const mainContent = details || String(d.description ?? '').trim()
  const additionalInfo = [mainContent, attrs.join('\n')].filter(Boolean).join('\n\n')

  // 도입부: startingScenarios 우선, 없으면 top-level initial*(+replySuggestions).
  const scenarios = Array.isArray(d.startingScenarios) && d.startingScenarios.length
    ? d.startingScenarios
    : [{ initialTitle: d.initialTitle, initialAction: d.initialAction, initialMessage: d.initialMessage, replySuggestions: d.replySuggestions }]
  const openingMessages = scenarios
    .map((s: any, i: number) => {
      const content = [stripImgTokens(String(s.initialAction ?? '')), stripImgTokens(String(s.initialMessage ?? ''))]
        .filter(Boolean)
        .join('\n\n')
      // 답장 예시(replySuggestions): 유저가 고를 수 있는 응답 후보. 창작자 팁이 섞여 오기도 하지만
      // 걸러낼 신뢰할 만한 기준이 없어 그대로 보존한다(정보 손실 방지 우선).
      const suggestions = arr(s.replySuggestions).map((t) => stripImgTokens(t)).filter(Boolean)
      const suggestionsBlock = suggestions.length
        ? `[답장 예시]\n${suggestions.map((t, idx) => `${idx + 1}. ${t}`).join('\n')}`
        : ''
      return { id: String(i), title: String(s.initialTitle ?? '').trim() || `도입부 ${i + 1}`, content: [content, suggestionsBlock].filter(Boolean).join('\n\n') }
    })
    .filter((o: any) => o.content)

  const tags = arr(d.tags)
  const image = String(d.mainImage || d.profileImage || d.thumbnailImage || '').trim()
  const gallery = galleryUrls(d)

  const character: AssembledCharacter = {
    name,
    gender: GENDER_MAP[String(d.targetGender)] ?? '',
    tags,
    additionalInfo,
    openingMessage: openingMessages[0]?.content ?? '',
    openingMessages: openingMessages.length > 1 ? openingMessages : undefined,
    exampleDialogues: '',
    avatarUrl: String(d.profileImage || image || '').trim() || undefined,
    ...(gallery.length ? { relatedImages: gallery } : {}),
  }

  return {
    characters: [character],
    scenarioDescription: String(d.description ?? '').trim(),
    tags,
    title: name,
    safetyLevel: d.isAdult ? 'relaxed' : 'standard',
    coverImageUrl: image || undefined,
  }
}

export async function captureBabechat(url: string): Promise<Captured> {
  const id = parseBabechatUrl(url)
  let token = await getConfig('babechat_access_token')
  if (!token) throw new Error('babechat 토큰이 설정되지 않았습니다. 관리자 설정에서 토큰을 입력하세요.')

  let res = await fetchCharacter(id, token)
  if (res.status === 401 || res.status === 403) {
    token = await refreshAccessToken()
    res = await fetchCharacter(id, token)
  }
  if (res.status === 404) throw new Error('babechat 캐릭터를 찾을 수 없습니다.')
  if (!res.ok) throw new Error(`babechat 조회 오류 (HTTP ${res.status})`)

  const assembledResult = assembleBabechat(await res.json())
  const character = assembledResult.characters[0]

  console.log(`[babechat-import] ok — name=${character.name} tags=${character.tags?.length ?? 0} openings=${character.openingMessages?.length ?? 1} safety=${assembledResult.safetyLevel}`)

  return {
    sections: [],
    title: character.name,
    imageUrl: assembledResult.coverImageUrl ?? '',
    assembledResult,
  }
}
