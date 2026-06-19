// 러비더비(loveydovey.ai) 국내 센터 가져오기 — 메타데이터 한정.
// 캐릭터 데이터는 Firebase(reelso-prod) Firestore에 있고, Characters/{id} 문서는
// 공개 읽기가 허용되어 비로그인으로 메타데이터(이름·한줄소개·직업·나이·장르·이미지)를 받는다.
// ⚠️ persona·도입부(first_message)는 서버 보호(비공개 서브컬렉션)라 인증으로도 추출 불가.
//    → 메타만 가져오고, 설정·도입부는 사용자가 edit에서 채운다.
import type { Captured, AssembledCharacter, AssembledResult } from './types'

// reelso-prod 웹 앱의 공개 Firebase apiKey(클라이언트에 그대로 노출되는 값).
const FIREBASE_API_KEY = 'AIzaSyB4ocqQYdk7_QylMTS_a51Bq1T58sLOJtg'
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/reelso-prod/databases/(default)/documents/Characters'

// 우리 서비스 언어. 번역맵에서 이 언어를 우선 사용.
const PREFERRED_LANG = 'ko'

const GENRE_MAP: Record<string, string> = {
  MODERN_ROMANCE: '현대로맨스',
  FANTASY_ROMANCE: '판타지로맨스',
  HISTORICAL_ROMANCE: '시대로맨스',
  FANTASY: '판타지',
  ROMANCE: '로맨스',
  DAILY: '일상',
}

// URL에서 캐릭터 id 추출. 형식: loveydovey.ai/characters/{id}
export function parseLoveydoveyUrl(url: string): string {
  const m = url.match(/\/characters\/([A-Za-z0-9_-]{6,})/)
  if (!m) throw new Error('러비더비 캐릭터 URL이 아닙니다 (/characters/{id} 형식 필요)')
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
  return field[t]
}

// Firestore 문서(fields) → AssembledResult (메타데이터 한정).
export function assembleLoveydovey(fields: any): AssembledResult {
  const top: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields ?? {})) top[k] = fsVal(v)

  // 번역맵에서 선호 언어 메타 선택(없으면 top-level).
  const tii = top.translatedInstructionInfos ?? {}
  const loc = tii[PREFERRED_LANG] ?? {}
  const name = (loc.name ?? top.name ?? '').trim()
  if (!name) throw new Error('러비더비 캐릭터 정보를 찾을 수 없습니다.')

  const description = (loc.description ?? top.description ?? '').trim() // 한줄소개(태그라인)
  const job = (loc.job ?? top.job ?? '').trim()
  const age = String(loc.age ?? top.age ?? '').trim()
  const genreRaw = String(top.primaryGenre ?? '').trim()
  const genre = GENRE_MAP[genreRaw] ?? ''
  const image = (top.chatbotImageUrl ?? '').trim()
  const isAdult = String(top.ageRestriction ?? '').toUpperCase().includes('ADULT')
    || String(top.ageRestriction ?? '').toUpperCase() === 'R_ONLY'

  const additionalInfo = [
    job && `직업: ${job}`,
    age && `나이: ${age}`,
    genre && `장르: ${genre}`,
    '\n(러비더비는 메타데이터만 가져옵니다. 상세 설정·첫 장면은 직접 입력하세요.)',
  ]
    .filter(Boolean)
    .join('\n')

  const tags = genre ? [genre] : []

  const character: AssembledCharacter = {
    name,
    gender: '',
    tags,
    additionalInfo,
    openingMessage: '', // 도입부는 공개되지 않음
    exampleDialogues: '',
    avatarUrl: image || undefined,
  }

  return {
    characters: [character],
    scenarioDescription: description,
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
  if (res.status === 404) throw new Error('러비더비 캐릭터를 찾을 수 없습니다.')
  if (!res.ok) throw new Error(`러비더비 조회 오류 (HTTP ${res.status})`)

  const doc = await res.json()
  const assembledResult = assembleLoveydovey(doc?.fields)
  const character = assembledResult.characters[0]

  console.log(`[loveydovey-import] ok (meta only) — name=${character.name} safety=${assembledResult.safetyLevel}`)

  return {
    sections: [],
    title: character.name,
    imageUrl: assembledResult.coverImageUrl ?? '',
    assembledResult,
  }
}
