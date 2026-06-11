# 페르소나 대화방 태그 + 완결 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/characters` 페이지에서 페르소나로 참여한 대화도 캐릭터 완결 판정에 포함시키고, 캐릭터 카드에 "참여한 대화방" 태그(`rooms`)를 표시하며, 완결 탭에서 대화방 단위로 필터링한다.

**Architecture:** `GET /api/characters`가 기존 `ConversationCharacter` 기반 집계에 더해 `Conversation.personaCharacterId` 기반 대화도 함께 조회·집계하여 `completed`/`hasArchived`를 통합 계산하고, 새 필드 `rooms: {id,title}[]`(소속 컬렉션 + 페르소나 참여 대화방)을 응답에 추가한다. UI는 `rooms`를 카드 칩으로 표시하고, 완결 탭에 `rooms` 기반 필터 칩을 추가한다. `lib/completion.ts`는 변경 없음 — 기존 `aggregateCounts`/`isCompleted`/`hasArchived`를 더 큰 입력 배열에 재사용한다.

**Tech Stack:** Next.js 14 (App Router, API Routes), Prisma + PostgreSQL, React, TypeScript.

**스펙:** `apps/web/docs/superpowers/specs/2026-06-11-persona-room-completion-design.md`

**검증 도구 참고:**
- 타입체크: `npx tsc --noEmit` (apps/web 디렉터리, 출력 없고 종료코드 0이면 성공, ~20초 소요)
- 로컬엔 DATABASE_URL이 없어 API 라우트는 런타임 대신 타입체크로 검증.

---

## 파일 구조

| 파일 | 책임 | 변경 유형 |
|------|------|-----------|
| `app/api/characters/route.ts` | 페르소나 참여 대화 집계, `rooms` 필드, 통합 완결 판정 | 수정 |
| `types/index.ts` | `Character`에 `rooms?: {id,title}[]` 추가 | 수정 |
| `app/(main)/characters/page.tsx` | 카드에 `rooms` 칩 표시, 완결 탭 대화방 필터 | 수정 |

---

## Task 1: `GET /api/characters` — 페르소나 참여 대화 집계 + `rooms` + 통합 완결 판정

**Files:**
- Modify: `app/api/characters/route.ts`

현재 파일 전체 (86줄):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { aggregateCounts, isCompleted, hasArchived, type CountableConversation } from '@/lib/completion'

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('isWhif') === 'true' ? 'whif'
    : searchParams.get('isZeta') === 'true' ? 'zeta'
    : searchParams.get('isMelting') === 'true' ? 'melting'
    : 'regular'

  const whereClause =
    source === 'whif'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'whif.' } } }
    : source === 'zeta'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'zeta-ai.io' } } }
    : source === 'melting'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'melting.chat' } } }
      : {
          OR: [
            { isPreset: true },
            { creatorId: userId },
          ],
        }

  const characters = await prisma.character.findMany({
    where: whereClause,
    orderBy: [{ isPreset: 'desc' }, { createdAt: 'asc' }],
    include: {
      collection: { select: { id: true, title: true, sourceUrl: true } },
      conversations: {
        where: { conversation: { userId, characterCollection: { isNot: null } } },
        take: 1,
        select: {
          conversation: {
            select: { characterCollection: { select: { id: true, title: true } } },
          },
        },
      },
      personaConversations: {
        where: { userId, characterCollection: { isNot: null } },
        take: 1,
        select: { characterCollection: { select: { id: true, title: true } } },
      },
    },
  })

  // 캐릭터별 대화 집계 (완결/뱃지 판정용)
  const charIds = characters.map(c => c.id)
  const convLinks = charIds.length > 0
    ? await prisma.conversationCharacter.findMany({
        where: { characterId: { in: charIds }, conversation: { userId } },
        select: {
          characterId: true,
          conversation: { select: { isArchived: true, rootConversationId: true, mode: true } },
        },
      })
    : []

  const convsByChar = new Map<string, CountableConversation[]>()
  for (const link of convLinks) {
    const arr = convsByChar.get(link.characterId) ?? []
    arr.push(link.conversation)
    convsByChar.set(link.characterId, arr)
  }

  // 직접 collectionId → ConversationCharacter 경유 → 페르소나로 사용된 대화 순으로 컬렉션 결정
  const result = characters.map(({ conversations, personaConversations, ...c }) => {
    const counts = aggregateCounts(convsByChar.get(c.id) ?? [])
    return {
      ...c,
      collection: c.collection
        ?? conversations[0]?.conversation?.characterCollection
        ?? personaConversations[0]?.characterCollection
        ?? null,
      completed: isCompleted(counts),
      hasArchived: hasArchived(counts),
    }
  })

  return NextResponse.json(result)
}
```

### 배경

- `convsByChar`: 캐릭터가 **AI 캐릭터로 참여한 대화**(`ConversationCharacter` 경유) 집계. 완결 판정에 사용.
- 이번 작업: 캐릭터가 **페르소나로 참여한 대화**(`Conversation.personaCharacterId === character.id`)도 같은 방식으로 집계해서 완결 판정에 합치고, 참여한 대화방 정보를 `rooms` 필드로 응답에 추가한다.
- 필터는 기존 `convsByChar` 집계와 동일하게: `userId` 일치, `rootConversationId = null`(브랜치 제외), `mode !== 'assistant'`.
- `Conversation.title`은 스키마상 필수 문자열 필드(`prisma/schema.prisma` `model Conversation { title String ... }`).

- [ ] **Step 1: 페르소나 참여 대화 조회 추가**

`// 캐릭터별 대화 집계 (완결/뱃지 판정용)` 블록(`convsByChar` 생성 부분) 바로 다음에 추가:

```ts
  // 페르소나로 참여한 대화 집계 (완결 판정 + 참여 대화방 태그용)
  const personaConvs = charIds.length > 0
    ? await prisma.conversation.findMany({
        where: {
          personaCharacterId: { in: charIds },
          userId,
          rootConversationId: null,
          mode: { not: 'assistant' },
        },
        select: { id: true, title: true, isArchived: true, personaCharacterId: true },
      })
    : []

  const personaRoomsByChar = new Map<string, { id: string; title: string; isArchived: boolean }[]>()
  for (const pc of personaConvs) {
    const charId = pc.personaCharacterId as string
    const arr = personaRoomsByChar.get(charId) ?? []
    arr.push({ id: pc.id, title: pc.title, isArchived: pc.isArchived })
    personaRoomsByChar.set(charId, arr)
  }
```

- [ ] **Step 2: 결과 매핑에서 통합 완결 판정 + `rooms` 추가**

기존:

```ts
  // 직접 collectionId → ConversationCharacter 경유 → 페르소나로 사용된 대화 순으로 컬렉션 결정
  const result = characters.map(({ conversations, personaConversations, ...c }) => {
    const counts = aggregateCounts(convsByChar.get(c.id) ?? [])
    return {
      ...c,
      collection: c.collection
        ?? conversations[0]?.conversation?.characterCollection
        ?? personaConversations[0]?.characterCollection
        ?? null,
      completed: isCompleted(counts),
      hasArchived: hasArchived(counts),
    }
  })
```

교체:

```ts
  // 직접 collectionId → ConversationCharacter 경유 → 페르소나로 사용된 대화 순으로 컬렉션 결정
  const result = characters.map(({ conversations, personaConversations, ...c }) => {
    const personaRooms = personaRoomsByChar.get(c.id) ?? []
    const counts = aggregateCounts([
      ...(convsByChar.get(c.id) ?? []),
      ...personaRooms.map(pr => ({ isArchived: pr.isArchived, rootConversationId: null, mode: 'roleplay' })),
    ])

    const collection = c.collection
      ?? conversations[0]?.conversation?.characterCollection
      ?? personaConversations[0]?.characterCollection
      ?? null

    const roomsMap = new Map<string, string>()
    if (collection) roomsMap.set(collection.id, collection.title)
    for (const pr of personaRooms) roomsMap.set(pr.id, pr.title)

    return {
      ...c,
      collection,
      rooms: Array.from(roomsMap.entries()).map(([id, title]) => ({ id, title })),
      completed: isCompleted(counts),
      hasArchived: hasArchived(counts),
    }
  })
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit` (apps/web 디렉터리)
Expected: 출력 없음, 종료코드 0

- [ ] **Step 4: 커밋**

```bash
git add app/api/characters/route.ts
git commit -m "Feat: GET /api/characters 페르소나 참여 대화 완결 집계 + rooms 필드"
```

---

## Task 2: `Character` 타입에 `rooms` 추가

**Files:**
- Modify: `types/index.ts`

현재 (18-43줄 발췌):

```ts
export interface CharacterCollection {
  id: string
  title: string
}

export interface Character {
  id: string
  kind?: AvatarKind
  name: string
  gender?: string
  avatarUrl?: string
  tags: string[]
  additionalInfo: string
  exampleDialogues: string
  openingMessage?: string
  safetyLevel: SafetyLevel
  temperature: number
  frequencyPenalty: number
  maxOutputTokens?: number
  thinkingBudget?: number
  isPreset: boolean
  isAutoCreated?: boolean
  collection?: CharacterCollection | null
  completed?: boolean
  hasArchived?: boolean
}
```

- [ ] **Step 1: `rooms` 필드 추가**

`hasArchived?: boolean` 다음 줄에 추가:

```ts
  hasArchived?: boolean
  rooms?: { id: string; title: string }[]
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit` (apps/web 디렉터리)
Expected: 출력 없음, 종료코드 0

- [ ] **Step 3: 커밋**

```bash
git add types/index.ts
git commit -m "Feat: Character 타입에 rooms 필드 추가"
```

---

## Task 3: `/characters` 페이지 — 카드에 `rooms` 칩 표시

**Files:**
- Modify: `app/(main)/characters/page.tsx`

### 배경

- 현재 진행 탭 카드는 `c.collection`이 있으면 카드 우상단에 단일 뱃지(파란색, `#4fa8e8`)로 컬렉션 제목을 표시한다 (335-337줄).
- 완결 탭 카드는 현재 어떤 참여 대화방 정보도 표시하지 않는다.
- 이번 작업: 두 카드 종류 모두에서 기존 단일 컬렉션 뱃지를 제거하고, `c.rooms`(컬렉션 제목 + 페르소나 참여 대화방 제목, 최대 2개 + "+N")를 이름 아래에 칩으로 표시하는 공용 `RoomChips` 컴포넌트를 추가한다.

- [ ] **Step 1: `RoomChips` 컴포넌트 추가**

파일 상단의 `sparkleAt` 함수(11-21줄) 바로 다음, `export default function CharactersPage()` 이전에 추가:

```tsx
function RoomChips({ rooms }: { rooms?: { id: string; title: string }[] }) {
  if (!rooms || rooms.length === 0) return null
  const shown = rooms.slice(0, 2)
  const extra = rooms.length - shown.length
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginTop: 2 }}>
      {shown.map(r => (
        <span key={r.id} style={{ fontSize: 9, fontWeight: 700, background: '#4fa8e8', color: '#fff', padding: '1px 5px', borderRadius: 3, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
      ))}
      {extra > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-soft)' }}>+{extra}</span>}
    </div>
  )
}
```

- [ ] **Step 2: 완결 탭 카드에 `RoomChips` 추가**

현재 (완결 카드 분기, 282-302줄 부근):

```tsx
            if (view === 'completed') {
              return (
                <div key={c.id} className="char-card" style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>
                  <div className="pic-wrap">
                    {c.avatarUrl
                      ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <PixelAvatar kind={c.kind} size={72} />
                    }
                  </div>
                  <h4>{c.name}</h4>
                  {c.tags?.length > 0
                    ? <p className="tiny muted" style={{ marginTop: 2 }}>{c.tags.slice(0, 3).join(' · ')}</p>
                    : <p style={{ opacity: 0 }}>—</p>
                  }
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} disabled={duplicating} onClick={() => handleDuplicate(c.id)}>⎘ 복제</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteId(c.id)}>✕ 삭제</button>
                  </div>
                </div>
              )
            }
```

`{c.tags?.length > 0 ? ... : ...}` 블록과 복제/삭제 버튼 `<div className="hstack" ...>` 사이에 `<RoomChips rooms={c.rooms} />` 추가:

```tsx
            if (view === 'completed') {
              return (
                <div key={c.id} className="char-card" style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>
                  <div className="pic-wrap">
                    {c.avatarUrl
                      ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                      : <PixelAvatar kind={c.kind} size={72} />
                    }
                  </div>
                  <h4>{c.name}</h4>
                  {c.tags?.length > 0
                    ? <p className="tiny muted" style={{ marginTop: 2 }}>{c.tags.slice(0, 3).join(' · ')}</p>
                    : <p style={{ opacity: 0 }}>—</p>
                  }
                  <RoomChips rooms={c.rooms} />
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} disabled={duplicating} onClick={() => handleDuplicate(c.id)}>⎘ 복제</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteId(c.id)}>✕ 삭제</button>
                  </div>
                </div>
              )
            }
```

- [ ] **Step 3: 진행 탭 카드 — 기존 컬렉션 단일 뱃지 제거 + `RoomChips` 추가**

현재 (진행 카드 분기, 304-356줄 부근):

```tsx
            return (
              <div
                key={c.id}
                className={`char-card ${!selecting && draft.charId === c.id ? 'selected' : ''}`}
                style={{
                  position: 'relative',
                  ...(c.isAutoCreated ? { background: 'rgba(0,140,255,0.06)', borderColor: '#4fa8e8' } : {}),
                  ...(selecting && isChecked ? { background: 'var(--lavender)', borderColor: 'var(--hot-pink)' } : {}),
                  cursor: selecting ? 'pointer' : undefined,
                }}
                onClick={e => {
                  if (selecting) {
                    if (!c.isPreset) toggleSelect(c.id)
                    return
                  }
                  sparkleAt(e.clientX, e.clientY)
                  dispatch({ type: 'selectChar', id: c.id })
                }}
              >
                {selecting && !c.isPreset && (
                  <div style={{
                    position: 'absolute', top: 6, left: 6, zIndex: 5,
                    width: 18, height: 18,
                    border: `2px solid ${isChecked ? 'var(--hot-pink)' : 'var(--chrome-border)'}`,
                    background: isChecked ? 'var(--hot-pink)' : 'rgba(0,0,0,0.5)',
                    borderRadius: 3,
                    display: 'grid', placeItems: 'center',
                  }}>
                    {isChecked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </div>
                )}
                {c.collection && (
                  <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, fontWeight: 700, background: '#4fa8e8', color: '#fff', padding: '1px 5px', borderRadius: 3, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.collection.title}</div>
                )}
                <div className="pic-wrap">
                  {c.avatarUrl
                    ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <PixelAvatar kind={c.kind} size={72} />
                  }
                </div>
                <h4>{c.name}</h4>
                {c.tags?.length > 0
                  ? <p className="tiny muted" style={{ marginTop: 2 }}>{c.tags.slice(0, 3).join(' · ')}</p>
                  : <p style={{ opacity: 0 }}>—</p>
                }
                {!c.isPreset && !selecting && (
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${c.id}/edit`)}>✏ 수정</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}>✕ 삭제</button>
                  </div>
                )}
              </div>
            )
```

교체 (1. `{c.collection && (...)}` 뱃지 블록 제거, 2. 태그 블록과 수정/삭제 버튼 사이에 `<RoomChips rooms={c.rooms} />` 추가):

```tsx
            return (
              <div
                key={c.id}
                className={`char-card ${!selecting && draft.charId === c.id ? 'selected' : ''}`}
                style={{
                  position: 'relative',
                  ...(c.isAutoCreated ? { background: 'rgba(0,140,255,0.06)', borderColor: '#4fa8e8' } : {}),
                  ...(selecting && isChecked ? { background: 'var(--lavender)', borderColor: 'var(--hot-pink)' } : {}),
                  cursor: selecting ? 'pointer' : undefined,
                }}
                onClick={e => {
                  if (selecting) {
                    if (!c.isPreset) toggleSelect(c.id)
                    return
                  }
                  sparkleAt(e.clientX, e.clientY)
                  dispatch({ type: 'selectChar', id: c.id })
                }}
              >
                {selecting && !c.isPreset && (
                  <div style={{
                    position: 'absolute', top: 6, left: 6, zIndex: 5,
                    width: 18, height: 18,
                    border: `2px solid ${isChecked ? 'var(--hot-pink)' : 'var(--chrome-border)'}`,
                    background: isChecked ? 'var(--hot-pink)' : 'rgba(0,0,0,0.5)',
                    borderRadius: 3,
                    display: 'grid', placeItems: 'center',
                  }}>
                    {isChecked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </div>
                )}
                <div className="pic-wrap">
                  {c.avatarUrl
                    ? <img src={c.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <PixelAvatar kind={c.kind} size={72} />
                  }
                </div>
                <h4>{c.name}</h4>
                {c.tags?.length > 0
                  ? <p className="tiny muted" style={{ marginTop: 2 }}>{c.tags.slice(0, 3).join(' · ')}</p>
                  : <p style={{ opacity: 0 }}>—</p>
                }
                <RoomChips rooms={c.rooms} />
                {!c.isPreset && !selecting && (
                  <div className="hstack" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                    <button className="btn ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => router.push(`/characters/${c.id}/edit`)}>✏ 수정</button>
                    <button className="btn danger" style={{ fontSize: 10, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}>✕ 삭제</button>
                  </div>
                )}
              </div>
            )
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit` (apps/web 디렉터리)
Expected: 출력 없음, 종료코드 0

- [ ] **Step 5: 커밋**

```bash
git add "app/(main)/characters/page.tsx"
git commit -m "Feat: 캐릭터 카드에 참여 대화방(rooms) 칩 표시"
```

---

## Task 4: 완결 탭 — 대화방 필터

**Files:**
- Modify: `app/(main)/characters/page.tsx`

### 배경

- Task 3에서 `c.rooms`가 카드에 표시된다. 이번 작업은 완결 탭 상단에 "전체" + 완결된 캐릭터들의 `rooms`를 모은 필터 칩 목록을 추가하고, 선택한 대화방을 `rooms`에 포함한 완결 캐릭터만 보이도록 한다.
- 기존 `collectionFilter`(진행 탭 전용, `view === 'active'`)와는 별개의 새 상태 `roomFilter`를 사용한다.

- [ ] **Step 1: `roomFilter` 상태 추가**

현재 (38-39줄):

```ts
  const [view, setView] = useState<'active' | 'completed'>('active')
  const [duplicating, setDuplicating] = useState(false)
```

교체:

```ts
  const [view, setView] = useState<'active' | 'completed'>('active')
  const [duplicating, setDuplicating] = useState(false)
  const [roomFilter, setRoomFilter] = useState<string>('all')
```

- [ ] **Step 2: `completedRooms` 파생 목록 추가**

현재 (71-77줄, `collections` useMemo):

```ts
  const collections = useMemo(() => {
    const map = new Map<string, string>()
    characters.forEach(c => {
      if (c.collection) map.set(c.collection.id, c.collection.title)
    })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [characters])
```

바로 다음 줄에 추가:

```ts
  const completedRooms = useMemo(() => {
    const map = new Map<string, string>()
    characters.filter(c => c.completed).forEach(c => {
      c.rooms?.forEach(r => map.set(r.id, r.title))
    })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [characters])
```

- [ ] **Step 3: `filteredCharacters`에 `roomFilter` 적용**

현재 (79-85줄):

```ts
  const filteredCharacters = useMemo(() => {
    if (view === 'completed') return characters.filter(c => c.completed)
    const active = characters.filter(c => !c.completed)
    if (collectionFilter === 'all') return active
    if (collectionFilter === 'none') return active.filter(c => !c.collection && !c.isPreset)
    return active.filter(c => c.collection?.id === collectionFilter)
  }, [characters, collectionFilter, view])
```

교체:

```ts
  const filteredCharacters = useMemo(() => {
    if (view === 'completed') {
      const completed = characters.filter(c => c.completed)
      if (roomFilter === 'all') return completed
      return completed.filter(c => c.rooms?.some(r => r.id === roomFilter))
    }
    const active = characters.filter(c => !c.completed)
    if (collectionFilter === 'all') return active
    if (collectionFilter === 'none') return active.filter(c => !c.collection && !c.isPreset)
    return active.filter(c => c.collection?.id === collectionFilter)
  }, [characters, collectionFilter, roomFilter, view])
```

- [ ] **Step 4: 탭 전환 시 `roomFilter` 초기화**

현재 (213-224줄):

```tsx
        <div className="hstack" style={{ gap: 6 }}>
          <button
            className={`btn ${view === 'active' ? 'primary' : 'ghost'}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setView('active'); exitSelect() }}
          >진행 중</button>
          <button
            className={`btn ${view === 'completed' ? 'primary' : 'ghost'}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setView('completed'); exitSelect() }}
          >완결 캐릭터</button>
        </div>
```

교체:

```tsx
        <div className="hstack" style={{ gap: 6 }}>
          <button
            className={`btn ${view === 'active' ? 'primary' : 'ghost'}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setView('active'); setRoomFilter('all'); exitSelect() }}
          >진행 중</button>
          <button
            className={`btn ${view === 'completed' ? 'primary' : 'ghost'}`}
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setView('completed'); setRoomFilter('all'); exitSelect() }}
          >완결 캐릭터</button>
        </div>
```

- [ ] **Step 5: 완결 탭 대화방 필터 UI 추가**

현재 (228-245줄, `collectionFilter` 행):

```tsx
        {view === 'active' && collections.length > 0 && (
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: '전체' },
              { id: 'none', label: '미분류' },
              ...collections.map(col => ({ id: col.id, label: col.title })),
            ].map(tab => (
              <button
                key={tab.id}
                className={`btn ${collectionFilter === tab.id ? 'primary' : 'ghost'}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => { setCollectionFilter(tab.id); exitSelect() }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
```

바로 다음 줄에 추가:

```tsx
        {view === 'completed' && completedRooms.length > 0 && (
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: '전체' },
              ...completedRooms.map(r => ({ id: r.id, label: r.title })),
            ].map(tab => (
              <button
                key={tab.id}
                className={`btn ${roomFilter === tab.id ? 'primary' : 'ghost'}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => setRoomFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
```

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit` (apps/web 디렉터리)
Expected: 출력 없음, 종료코드 0

- [ ] **Step 7: 커밋**

```bash
git add "app/(main)/characters/page.tsx"
git commit -m "Feat: 완결 탭 대화방 필터 추가"
```

---

## Task 5: 최종 검토 + 배포

- [ ] **Step 1: 전체 검토**

Task 1~4 커밋 전체에 대해 스펙(`docs/superpowers/specs/2026-06-11-persona-room-completion-design.md`) 대조 검토:
- `GET /api/characters` 응답에 `rooms` 필드와 통합 `completed`/`hasArchived`가 반영되는지
- `/characters` 카드(진행/완결 모두)에 `rooms` 칩이 표시되는지, 기존 단일 컬렉션 뱃지가 제거되었는지
- 완결 탭 대화방 필터가 `roomFilter`로 정확히 동작하는지

- [ ] **Step 2: `npx tsc --noEmit` 최종 확인**

Run: `npx tsc --noEmit` (apps/web 디렉터리)
Expected: 출력 없음, 종료코드 0

- [ ] **Step 3: 2단계 배포**

```bash
# 1. apps/web 서브모듈 (main 브랜치)
cd apps/web && git push origin main

# 2. 부모 저장소 서브모듈 포인터 업데이트 (master 브랜치)
cd .. && git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (페르소나 대화방 태그 + 완결 연동)" && git push origin master
```
