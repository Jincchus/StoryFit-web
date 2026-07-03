// 팅글(tingle.chat) 순수 조립 함수 — 네트워크/토큰 처리는 capture.ts(captureTingle/
// captureTingleRaw/fetchTingleData)에 남기고, 테스트 가능한 매핑·조립 로직만 분리한다.
import type { Captured, AssembledCharacter } from './types'

export interface TingleWorldBookEntry {
  keyword: string[]
  content: string
  priority?: number
}

// 팅글 worldBook → 로어북. 실제 응답 필드는 publicContent/title이며 개별 keyword가 없다.
// isHideContent:true면 제작자가 내용을 비공개로 둬 서버가 publicContent를 비워 내려주므로 제외
// (실측 확인: context/tingle-parity.md — 비공개 항목은 publicContent도 빈 문자열로 옴).
// 키워드가 없으므로 title을 키워드로 사용한다(title 없으면 트리거 불가라 스킵).
export function mapTingleWorldBooks(data: any): TingleWorldBookEntry[] {
  const wbs = Array.isArray(data?.worldBooks) ? data.worldBooks : []
  const out: TingleWorldBookEntry[] = []
  for (const wb of wbs) {
    if (wb?.isHideContent) continue
    const content = String(wb?.publicContent ?? wb?.content ?? '').trim()
    const title = String(wb?.title ?? wb?.name ?? '').trim()
    if (!content || !title) continue
    out.push({ keyword: [title], content, priority: Number(wb?.priority ?? 0) })
  }
  return out
}

export interface TingleCharacterExtras {
  coverImageUrl: string
  tags: string[]
  safetyLevel: 'standard' | 'relaxed'
  lorebooks: TingleWorldBookEntry[]
  linkedRelations: string
  sceneInfo: string
  relatedImages: string[]
}

// 캐릭터(personas) API 응답 → Captured. unified(introduction/otherDetails만)와
// composite(job/personality/speakingStyle/favorites 구조화) 두 스키마를 모두 대응한다.
// isHide* 플래그는 팅글 앱 UI 표시 여부일 뿐이고 API는 항상 실제 내용을 반환하므로
// (실측 확인) 그대로 포함한다.
export function assembleTingleCharacter(data: any, extra: TingleCharacterExtras): Captured {
  const { coverImageUrl, tags, safetyLevel, lorebooks, linkedRelations, sceneInfo, relatedImages } = extra

  const name = data.name ?? '캐릭터'
  const introduction = data.introduction ?? ''
  const age = data.age ? `나이: ${data.age}세` : ''
  const characterDetails = String(data.characterDetails ?? '')
  const backgroundDetails = String(data.backgroundDetails ?? '')
  const creatorComment = data.creatorComment ?? ''

  const job = String(data.job ?? '').trim()
  const personality = String(data.personality ?? '').trim()
  const speakingStyle = String(data.speakingStyle ?? '').trim()
  const favorites = String(data.favorites ?? '').trim()
  const otherDetails = String(data.otherDetails ?? '').trim()

  const additionalInfo = [
    introduction,
    age,
    job && `직업: ${job}`,
    personality && `■ 성격\n${personality}`,
    speakingStyle && `■ 말투\n${speakingStyle}`,
    favorites && `■ 좋아하는 것\n${favorites}`,
    characterDetails,
    backgroundDetails,
    otherDetails,
    sceneInfo && `[세계관]\n${sceneInfo}`,
    creatorComment && `[제작자 메모]\n${creatorComment}`,
  ].filter(Boolean).join('\n\n')

  const rawOpenings = Array.isArray(data.openings) ? data.openings : []
  const openingMessages = rawOpenings
    .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map((o: any, idx: number) => ({
      id: String(o.id ?? `opening_${idx}`),
      title: String(o.title ?? (idx === 0 ? '기본 도입부' : `도입부 ${idx + 1}`)),
      content: String(o.content ?? ''),
    }))
    .filter((o: any) => o.content.trim().length > 0)

  const openingMessage = openingMessages[0]?.content ?? data.firstMessage ?? ''

  const character: AssembledCharacter = {
    name,
    gender: data.gender ?? '',
    tags,
    additionalInfo,
    openingMessage,
    openingMessages: openingMessages.length > 1 ? openingMessages : undefined,
    exampleDialogues: linkedRelations,
    avatarUrl: coverImageUrl || undefined,
    ...(relatedImages.length ? { relatedImages } : {}),
  }

  const result: Captured = {
    sections: [],
    title: name,
    imageUrl: coverImageUrl,
    assembledResult: {
      title: name,
      characters: [character],
      scenarioDescription: introduction,
      tags,
      safetyLevel,
      coverImageUrl,
    },
  }
  if (lorebooks.length > 0) result.lorebooks = lorebooks
  return result
}

export interface TingleBasicExtras {
  coverImageUrl: string
  tags: string[]
  safetyLevel: 'standard' | 'relaxed'
}

// 서사(universes) API 응답 → Captured. relationships/privateRelationships는
// exampleDialogues로 매핑(실제 대화 예시가 아니라 관계 설정 텍스트지만, 우리 시스템에서
// 이 필드가 참고용 부가정보로 쓰이는 자리라 그대로 매핑).
export function assembleTingleUniverse(data: any, extra: TingleBasicExtras): Captured {
  const { coverImageUrl, tags, safetyLevel } = extra
  const name = data.name ?? '서사'
  const introduction = data.introduction ?? ''
  const relationships = Array.isArray(data.relationships) ? data.relationships : []
  const privateRelationships = Array.isArray(data.privateRelationships) ? data.privateRelationships : []
  const exampleDialogues = [...relationships, ...privateRelationships].filter(Boolean).join('\n')

  const lorebooks = mapTingleWorldBooks(data)

  const result: Captured = {
    sections: [],
    title: name,
    imageUrl: coverImageUrl,
    assembledResult: {
      title: name,
      characters: [{
        name,
        gender: '',
        tags,
        additionalInfo: introduction,
        openingMessage: '',
        exampleDialogues,
        avatarUrl: coverImageUrl || undefined,
      }],
      scenarioDescription: introduction,
      tags,
      safetyLevel,
      coverImageUrl,
    },
  }
  if (lorebooks.length > 0) result.lorebooks = lorebooks
  return result
}

// 테마(scenes) API 응답 → Captured.
export function assembleTingleScene(data: any, extra: TingleBasicExtras): Captured {
  const { coverImageUrl, tags, safetyLevel } = extra
  const name = data.name ?? '테마'
  const introduction = data.introduction ?? ''
  const timeFrame = data.timeFrame ?? ''
  const otherDetails = data.otherDetails ?? ''
  const scenarioDesc = [introduction, timeFrame && `[시간대] ${timeFrame}`, otherDetails].filter(Boolean).join('\n\n')

  return {
    sections: [],
    title: name,
    imageUrl: coverImageUrl,
    assembledResult: {
      title: name,
      characters: [{
        name,
        gender: '',
        tags,
        additionalInfo: scenarioDesc,
        openingMessage: '',
        exampleDialogues: '',
        avatarUrl: coverImageUrl || undefined,
      }],
      scenarioDescription: scenarioDesc,
      tags,
      safetyLevel,
      coverImageUrl,
    },
  }
}
