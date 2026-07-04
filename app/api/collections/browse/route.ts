import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { aggregateCounts, isCompleted, type CountableConversation } from '@/lib/completion'
import { CENTERS, EXTERNAL_HOSTS } from '@/lib/centers'
import { cardGenderBucket, availableGenderBuckets, type GenderBucket } from '@/lib/cardGender'
import { sortByOption, type SortOption } from '@/lib/listSort'
import { tagCounts } from '@/lib/centerCounts'

// 전체 센터 리스트(explore/all) 전용 서버 페이지네이션 + 패싯 엔드포인트.
// 메타 블롭(zetaMeta 등)을 싣지 않는 경량 카드만 반환하고, 필터/정렬/카운트를 서버에서 수행한다.
// 무한스크롤: 필터 조합이 바뀌면 offset=0으로 재조회(패싯 포함), 스크롤 시 offset을 늘려 append.

type CardChar = { id: string; name: string; avatarUrl: string | null; gender: string | null }
type Card = {
  id: string; title: string; coverImageUrl: string; sourceUrl: string
  tags: string[]; description: string
  createdAt: string; lastActivityAt: string
  completed: boolean; started: boolean
  characters: CardChar[]
}

function centerKey(sourceUrl: string): string {
  const u = sourceUrl ?? ''
  return CENTERS.find(c => c.dbHosts.some(h => u.includes(h)))?.key ?? 'other'
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const view = (sp.get('view') ?? 'active') as 'active' | 'waiting' | 'completed' | 'favorites'
  const sort = (sp.get('sort') ?? 'latest') as SortOption
  const seed = Number(sp.get('seed') ?? 0)
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const centers = (sp.get('centers') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const gender = (sp.get('gender') ?? 'all') as GenderBucket | 'all'
  const selectedTags = (sp.get('tags') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const limit = Math.min(Math.max(Number(sp.get('limit') ?? 30), 1), 100)
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0)
  const withFacets = sp.get('facets') === '1' || offset === 0
  // 단일 센터 페이지(center=키)면 그 센터 호스트로만 DB 스코프 — 전체 로드 방지
  const centerKeyParam = sp.get('center')
  const scopeHosts = centerKeyParam
    ? (CENTERS.find(c => c.key === centerKeyParam)?.dbHosts ?? EXTERNAL_HOSTS)
    : EXTERNAL_HOSTS
  // tingle은 서사(universe)/테마(scene)도 리스트에 포함하고 타입 탭으로 필터한다.
  const isTingle = centerKeyParam === 'tingle'
  const tingleType = sp.get('tingleType') // 'character' | 'universe' | 'scene'
  const tingleTypeOf = (u: string) => u.includes('/chat/universes/') ? 'universe' : u.includes('/chat/scenes/') ? 'scene' : 'character'

  // 센터 컬렉션 경량 로드 — 메타 블롭은 싣지 않음 (tingle 외에는 서사/테마 제외)
  const cols = await prisma.characterCollection.findMany({
    where: {
      userId,
      OR: scopeHosts.map(h => ({ sourceUrl: { contains: h } })),
      ...(isTingle ? {} : {
        NOT: [
          { sourceUrl: { contains: 'tingle.chat/chat/universes/' } },
          { sourceUrl: { contains: 'tingle.chat/chat/scenes/' } },
        ],
      }),
    },
    select: {
      id: true, title: true, coverImageUrl: true, sourceUrl: true, description: true, tags: true, createdAt: true,
      characters: { select: { id: true, name: true, avatarUrl: true, gender: true } },
    },
  })

  const ids = cols.map(c => c.id)
  // 완결/시작 판정 + 최근활동 시각 (대화 링크 집계)
  const links = ids.length > 0
    ? await prisma.conversationCharacter.findMany({
        where: { conversation: { userId }, character: { collectionId: { in: ids } } },
        select: { character: { select: { collectionId: true } }, conversation: { select: { id: true, isArchived: true, rootConversationId: true, mode: true, updatedAt: true } } },
      })
    : []
  const convByCol = new Map<string, Map<string, CountableConversation>>()
  const lastAct = new Map<string, string>()
  for (const l of links) {
    const cid = l.character.collectionId
    if (!cid) continue
    const m = convByCol.get(cid) ?? new Map<string, CountableConversation>()
    m.set(l.conversation.id, l.conversation)
    convByCol.set(cid, m)
    const ua = l.conversation.updatedAt instanceof Date ? l.conversation.updatedAt.toISOString() : String(l.conversation.updatedAt)
    if (!lastAct.has(cid) || ua > lastAct.get(cid)!) lastAct.set(cid, ua)
  }
  // 즐겨찾기 집합
  const favRows = await prisma.favorite.findMany({ where: { userId, itemType: 'collection' }, select: { itemId: true } })
  const favSet = new Set(favRows.map(f => f.itemId))

  const cards: Card[] = cols.map(c => {
    const counts = aggregateCounts(Array.from(convByCol.get(c.id)?.values() ?? []))
    const createdAt = c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt)
    return {
      id: c.id, title: c.title, coverImageUrl: c.coverImageUrl ?? '', sourceUrl: c.sourceUrl ?? '',
      tags: c.tags ?? [], description: c.description ?? '',
      createdAt, lastActivityAt: lastAct.get(c.id) ?? createdAt,
      completed: isCompleted(counts),
      started: counts.activeCount + counts.archivedCount > 0,
      characters: c.characters.map(ch => ({ id: ch.id, name: ch.name, avatarUrl: ch.avatarUrl, gender: ch.gender })),
    }
  })

  // ── 필터 함수들 (클라 explore/all 과 동일 의미) ──
  const matchesCenter = (c: Card) => centers.length === 0 || centers.includes(centerKey(c.sourceUrl))
  const matchesQuery = (c: Card) => !q
    || c.title.toLowerCase().includes(q)
    || (c.tags.some(t => t.toLowerCase().includes(q)))
    || (c.description.toLowerCase().includes(q))
    || c.characters.some(ch => ch.name.toLowerCase().includes(q))
  const matchesGender = (c: Card) => gender === 'all' || cardGenderBucket(c.characters) === gender
  const matchesTags = (c: Card) => selectedTags.length === 0 || selectedTags.every(t => c.tags.includes(t))
  const matchesTingleType = (c: Card) => !isTingle || !tingleType || tingleTypeOf(c.sourceUrl) === tingleType
  const inView = (c: Card) => view === 'favorites' ? favSet.has(c.id)
    : view === 'completed' ? c.completed
    : view === 'waiting' ? !c.started
    : !c.completed && c.started

  const viewCenterBase = cards.filter(c => inView(c) && matchesCenter(c))
  // tingle 타입 필터는 뷰 필터처럼 별도 적용(타입 카운트는 타입 필터 전 기준으로 계산)
  const typedBase = viewCenterBase.filter(matchesTingleType)
  const filtered = sortByOption(
    typedBase.filter(c => matchesGender(c) && matchesQuery(c) && matchesTags(c)),
    sort, c => c.title, c => c.createdAt, c => c.lastActivityAt || c.createdAt, seed,
  )

  const page = filtered.slice(offset, offset + limit)

  // zeta/tikita 카드 부제(메타의 소필드)만 페이지 항목에 붙인다 — 전체 메타 블롭은 싣지 않음
  const pageIds = page.map(c => c.id)
  if (pageIds.length) {
    const metas = await prisma.characterCollection.findMany({
      where: { id: { in: pageIds } },
      select: { id: true, zetaMeta: true, tikitaMeta: true },
    })
    const metaById = new Map(metas.map(m => [m.id, m]))
    for (const c of page as any[]) {
      const m = metaById.get(c.id)
      const sd = (m?.zetaMeta as any)?.shortDescription
      const tl = (m?.tikitaMeta as any)?.tagline
      if (sd) c.zetaMeta = { shortDescription: sd }
      if (tl) c.tikitaMeta = { tagline: tl }
    }
  }

  const res: any = { items: page, total: filtered.length, hasMore: offset + limit < filtered.length }

  if (withFacets) {
    // 성별/태그 옵션은 타입 필터 적용 후(typedBase) 기준 — tingle에선 선택 타입 내에서 계산
    const genderQ = typedBase.filter(matchesQuery)
    const tagBase = typedBase.filter(c => matchesGender(c) && matchesQuery(c))
    res.facets = {
      counts: {
        active: cards.filter(c => !c.completed && c.started).length,
        waiting: cards.filter(c => !c.started).length,
        completed: cards.filter(c => c.completed).length,
        favorites: cards.filter(c => favSet.has(c.id)).length,
      },
      genders: availableGenderBuckets(genderQ),
      tags: tagCounts(tagBase),
      ...(isTingle ? {
        typeCounts: {
          character: viewCenterBase.filter(c => tingleTypeOf(c.sourceUrl) === 'character').length,
          universe: viewCenterBase.filter(c => tingleTypeOf(c.sourceUrl) === 'universe').length,
          scene: viewCenterBase.filter(c => tingleTypeOf(c.sourceUrl) === 'scene').length,
        },
      } : {}),
    }
  }

  return NextResponse.json(res)
}
