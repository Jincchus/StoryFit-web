// crack(crack.wrtn.ai) 스토리 가져오기.
// GET /crack-api/stories/{id} (스토리 상세) + /associated-characters (등장 캐릭터 목록)의
// 응답을 StoryFit 조립 결과(AssembledResult)로 변환하는 순수 함수.
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
