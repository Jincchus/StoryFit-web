// loveydovey(loveydovey.ai) 국내 센터 가져오기.
// 캐릭터 데이터는 Firebase(reelso-prod) Firestore의 Chatbots/{id} 문서에 있고, 비로그인 REST GET이
// 공개로 허용된다(검증: 2026-06-30 HTTP 200). 도입부(greetingMessage)·풀세팅(characterSheet/
// instructionInfos/translatedInstructionInfos)이 전부 평문 공개이며, 호감도 잠금 이미지만 게이팅된다.
// 한국어 서비스이므로 translatedInstructionInfos.ko(전 필드 번역본)를 1순위로 사용한다.
import type { Captured, AssembledCharacter, AssembledResult } from './types'

// reelso-prod 웹 앱의 공개 Firebase apiKey(클라이언트에 그대로 노출되는 값).
const FIREBASE_API_KEY = 'AIzaSyB4ocqQYdk7_QylMTS_a51Bq1T58sLOJtg'
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/reelso-prod/databases/(default)/documents/Chatbots'

// 우리 서비스 언어. translatedInstructionInfos에서 이 언어를 우선 사용.
const PREFERRED_LANG = 'ko'

const GENRE_MAP: Record<string, string> = {
  MODERN_ROMANCE: '현대로맨스',
  FANTASY_ROMANCE: '판타지로맨스',
  HISTORICAL_ROMANCE: '시대로맨스',
  FANTASY: '판타지',
  ROMANCE: '로맨스',
  DAILY: '일상',
}

const GENDER_MAP: Record<string, string> = { MALE: '남성', FEMALE: '여성' }

// URL에서 캐릭터 id 추출. 형식: loveydovey.ai/characters/{id}
export function parseLoveydoveyUrl(url: string): string {
  const m = url.match(/\/characters\/([A-Za-z0-9_-]{6,})/)
  if (!m) throw new Error('loveydovey 캐릭터 URL이 아닙니다 (/characters/{id} 형식 필요)')
  return m[1]
}

// Firestore REST 필드값({stringValue}/{integerValue}/...)에서 원시값 추출.
function fsVal(field: any): any {
  if (field == null) return undefined
  const t = Object.keys(field)[0]
  if (t === 'mapValue') {
    const out: any = {}
    for (const [k, v] of Object.entries(field.mapValue?.fields ?? {})) out[k] = fsVal(v)
    return out
  }
  if (t === 'arrayValue') return (field.arrayValue?.values ?? []).map(fsVal)
  if (t === 'integerValue') return Number(field.integerValue)
  if (t === 'doubleValue') return Number(field.doubleValue)
  if (t === 'booleanValue') return field.booleanValue
  if (t === 'nullValue') return null
  return field[t]
}

const str = (v: any): string => (v == null ? '' : String(v)).trim()

// 해시태그 정리: 선행 '#' 제거, '_'→공백, 중복/빈값 제거, 최대 20개.
function cleanTags(arr: any): string[] {
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    const t = str(raw).replace(/^#/, '').replace(/_/g, ' ').trim()
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
    if (out.length >= 20) break
  }
  return out
}

// relationships 맵 → "이름: 설명" 줄 목록.
function relationshipsText(rel: any): string {
  if (!rel || typeof rel !== 'object' || Array.isArray(rel)) return ''
  const lines: string[] = []
  for (const [k, v] of Object.entries(rel)) {
    const val = typeof v === 'string' ? v : str((v as any)?.description ?? (v as any)?.content ?? '')
    if (k && val) lines.push(`${k}: ${val}`)
    else if (val) lines.push(val)
  }
  return lines.join('\n')
}

// additionalInfos 배열 → 텍스트.
function additionalInfosText(arr: any): string {
  if (!Array.isArray(arr)) return ''
  return arr
    .map((it) => {
      if (typeof it === 'string') return it.trim()
      const title = str(it?.title ?? it?.name ?? it?.key)
      const content = str(it?.content ?? it?.value ?? it?.description)
      return title && content ? `${title}: ${content}` : (content || title)
    })
    .filter(Boolean)
    .join('\n')
}

// optionalChatbotImages → url 문자열 배열(공개 추가 이미지).
function optionalImageUrls(arr: any): string[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((it) => (typeof it === 'string' ? it : str(it?.url ?? it?.imageUrl ?? it?.chatbotImageUrl)))
    .filter((u) => /^https?:\/\//.test(u))
}

// Firestore Chatbots/{id} 문서(fields) → AssembledResult.
export function assembleLoveydovey(fields: any): AssembledResult {
  const top: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields ?? {})) top[k] = fsVal(v)

  // 번역맵에서 선호 언어 선택(ko → en → 첫 언어). 구조화 전 필드가 번역되어 있다.
  const tii = top.translatedInstructionInfos ?? {}
  const loc = tii[PREFERRED_LANG] ?? tii['en'] ?? Object.values(tii)[0] ?? {}
  // 구조화 원본(번역맵에 없는 relationships/additionalInfos 보강용).
  const instr = top.instructionInfos ?? {}

  // loc(번역) → instr(원본 구조화) → top(루트) 순으로 선택.
  const pick = (key: string): string => str((loc as any)[key] ?? (instr as any)[key] ?? top[key])

  const name = pick('name') || str(top.name)
  if (!name) throw new Error('loveydovey 캐릭터 정보를 찾을 수 없습니다.')

  const gender = GENDER_MAP[str(top.gender).toUpperCase()] ?? ''
  const job = pick('job')
  const age = pick('age')
  const appearance = pick('appearance')
  const characteristic = pick('characteristic')
  const speechPattern = pick('speechPattern')
  const basicInfo = pick('basicInfo')
  const likes = pick('likes')
  const dislikes = pick('dislikes')
  const backgroundStory = pick('backgroundStory')
  const relText = relationshipsText((instr as any).relationships)
  const addText = additionalInfosText((instr as any).additionalInfos)

  const greeting = str((loc as any).greetingMessage ?? top.greetingMessage)
  const initSituation = str((loc as any).initSituation ?? top.initSituation)
  const description = str((loc as any).description ?? top.description) // 한줄소개/대사

  // 창작자 공지(있으면). translatedCreatorNotice.ko 우선.
  const tNotice = top.translatedCreatorNotice ?? {}
  const noticeText = str((tNotice[PREFERRED_LANG] ?? {}).content ?? top.creatorNotice?.content)

  const genre = GENRE_MAP[str(top.primaryGenre)] ?? ''
  const isAdult = (() => {
    const r = str(top.ageRestriction).toUpperCase()
    return r.includes('ADULT') || r === 'R_ONLY'
  })()

  const image = str(top.chatbotImageUrl)
  const relatedImages = optionalImageUrls(top.optionalChatbotImages)

  // 설정 본문 조립(라벨 블록). 구조화가 비면 characterSheet로 폴백.
  const parts: string[] = []
  const basics = [job && `직업: ${job}`, age && `나이: ${age}`, genre && `장르: ${genre}`].filter(Boolean).join(' · ')
  if (basics) parts.push(basics)
  if (appearance) parts.push(`■ 외형\n${appearance}`)
  if (characteristic) parts.push(`■ 성격\n${characteristic}`)
  if (speechPattern) parts.push(`■ 말투\n${speechPattern}`)
  if (basicInfo) parts.push(`■ 기본 정보\n${basicInfo}`)
  if (likes) parts.push(`■ 좋아하는 것\n${likes}`)
  if (dislikes) parts.push(`■ 싫어하는 것\n${dislikes}`)
  if (relText) parts.push(`■ 관계\n${relText}`)
  if (backgroundStory) parts.push(`■ 배경 이야기\n${backgroundStory}`)
  if (addText) parts.push(`■ 추가 설정\n${addText}`)

  // 구조화 본문이 부실하면(이름·직업 정도만) characterSheet 원문으로 폴백.
  const hasRichBody = !!(appearance || characteristic || speechPattern || backgroundStory)
  if (!hasRichBody && str(top.characterSheet)) {
    parts.length = 0
    parts.push(str(top.characterSheet))
  }
  if (noticeText) parts.push(`[창작자 공지]\n${noticeText}`)

  const additionalInfo = parts.filter(Boolean).join('\n\n')
  const tags = cleanTags((loc as any).hashtagNames ?? top.hashtagNames)
  if (!tags.length && genre) tags.push(genre) // 해시태그 없으면 장르를 태그로

  const character: AssembledCharacter = {
    name,
    gender,
    tags,
    additionalInfo,
    openingMessage: greeting,
    exampleDialogues: '',
    avatarUrl: image || undefined,
    ...(relatedImages.length ? { relatedImages } : {}),
  }

  return {
    characters: [character],
    scenarioDescription: initSituation || description,
    tags,
    title: name,
    safetyLevel: isAdult ? 'relaxed' : 'standard',
    coverImageUrl: image || undefined,
  }
}

export async function captureLoveydovey(url: string): Promise<Captured> {
  const id = parseLoveydoveyUrl(url)
  const res = await fetch(`${FIRESTORE}/${encodeURIComponent(id)}?key=${FIREBASE_API_KEY}`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) throw new Error('loveydovey 캐릭터를 찾을 수 없습니다.')
  if (!res.ok) throw new Error(`loveydovey 조회 오류 (HTTP ${res.status})`)

  const doc = await res.json()
  const assembledResult = assembleLoveydovey(doc?.fields)
  const character = assembledResult.characters[0]

  console.log(`[loveydovey-import] ok — name=${character.name} opening=${character.openingMessage ? 'y' : 'n'} tags=${character.tags?.length ?? 0} safety=${assembledResult.safetyLevel}`)

  return {
    sections: [],
    title: character.name,
    imageUrl: assembledResult.coverImageUrl ?? '',
    assembledResult,
  }
}
