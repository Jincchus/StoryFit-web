# 완결(Completion) 상태 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대화의 `isArchived`(서재)에서 파생 계산한 "완결" 상태로 캐릭터 선택 페이지와 WHIF/ZETA/MELTING 센터에 진행/완결 탭을 추가하고, 완결 캐릭터 복제 기능을 제공한다.

**Architecture:** 스키마 변경 없음. `lib/completion.ts`의 순수 함수가 대화 레코드 → `{activeCount, archivedCount}` → `completed`/`hasArchived` 판정 규칙을 단일 보관. API 라우트(`/api/characters`, `/api/collections`)가 이 함수를 사용해 응답에 필드를 추가하고, UI는 이 필드로 탭을 분기한다. 복제는 신규 라우트 `POST /api/characters/[id]/duplicate`.

**Tech Stack:** Next.js 14 (App Router, API Routes), Prisma + PostgreSQL, React, Vitest(node env, `lib/**/*.test.ts`만 포함).

**스펙:** `apps/web/docs/superpowers/specs/2026-06-10-completion-state-design.md`

**검증 도구 참고:**
- 순수 로직: `npx vitest run lib/completion.test.ts`
- 타입체크(라우트/UI): `npx tsc --noEmit` (출력 없고 종료코드 0이면 성공, ~20초 소요)
- 모든 명령은 `apps/web` 디렉터리에서 실행. 로컬엔 DATABASE_URL이 없어 라우트는 런타임 대신 타입체크로 검증.

---

## 파일 구조

| 파일 | 책임 | 변경 유형 |
|------|------|-----------|
| `lib/completion.ts` | 완결 판정 순수 함수 (`aggregateCounts`/`isCompleted`/`hasArchived`) | 생성 |
| `lib/completion.test.ts` | 위 함수 단위 테스트 | 생성 |
| `app/api/characters/route.ts` | GET 응답에 캐릭터별 `completed`/`hasArchived` 추가 | 수정 |
| `app/api/collections/route.ts` | GET 응답에 컬렉션별 `completed`, 캐릭터별 `hasArchived` 추가 | 수정 |
| `app/api/characters/[id]/duplicate/route.ts` | 캐릭터 복제 엔드포인트 | 생성 |
| `types/index.ts` | `Character`에 `completed?`/`hasArchived?` 추가 | 수정 |
| `app/(main)/characters/page.tsx` | 진행/완결 탭, 완결 카드(복제·삭제·뱃지) | 수정 |
| `app/(zeta)/zeta/page.tsx` | 진행/완결 탭, 완결 카드 뱃지 | 수정 |
| `app/(melting)/melting/page.tsx` | 진행/완결 탭, 완결 카드 뱃지 | 수정 |
| `app/(whif)/whif/page.tsx` | 진행/완결 탭(세계관 단위), 캐릭터 뱃지 | 수정 |

---

## Task 1: 완결 판정 순수 로직 (`lib/completion.ts`)

**Files:**
- Create: `lib/completion.ts`
- Test: `lib/completion.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `lib/completion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { aggregateCounts, isCompleted, hasArchived, type CountableConversation } from './completion'

const conv = (over: Partial<CountableConversation>): CountableConversation => ({
  isArchived: false,
  rootConversationId: null,
  mode: 'story',
  ...over,
})

describe('aggregateCounts', () => {
  it('활성/서재 대화를 각각 센다', () => {
    const result = aggregateCounts([
      conv({ isArchived: false }),
      conv({ isArchived: true }),
      conv({ isArchived: true }),
    ])
    expect(result).toEqual({ activeCount: 1, archivedCount: 2 })
  })

  it('브랜치 대화(rootConversationId != null)는 제외한다', () => {
    const result = aggregateCounts([
      conv({ isArchived: false, rootConversationId: 'root-1' }),
      conv({ isArchived: false }),
    ])
    expect(result).toEqual({ activeCount: 1, archivedCount: 0 })
  })

  it('assistant 모드 대화는 제외한다', () => {
    const result = aggregateCounts([
      conv({ isArchived: true, mode: 'assistant' }),
      conv({ isArchived: true, mode: 'story' }),
    ])
    expect(result).toEqual({ activeCount: 0, archivedCount: 1 })
  })

  it('빈 배열은 0/0', () => {
    expect(aggregateCounts([])).toEqual({ activeCount: 0, archivedCount: 0 })
  })
})

describe('isCompleted', () => {
  it('활성 0 + 서재 1개 이상이면 완결', () => {
    expect(isCompleted({ activeCount: 0, archivedCount: 2 })).toBe(true)
  })
  it('활성이 남아있으면 완결 아님', () => {
    expect(isCompleted({ activeCount: 1, archivedCount: 3 })).toBe(false)
  })
  it('대화가 하나도 없으면 완결 아님', () => {
    expect(isCompleted({ activeCount: 0, archivedCount: 0 })).toBe(false)
  })
})

describe('hasArchived', () => {
  it('서재 대화가 1개 이상이면 true', () => {
    expect(hasArchived({ activeCount: 2, archivedCount: 1 })).toBe(true)
  })
  it('서재 대화가 없으면 false', () => {
    expect(hasArchived({ activeCount: 3, archivedCount: 0 })).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/completion.test.ts`
Expected: FAIL — `Failed to resolve import "./completion"` (모듈 없음)

- [ ] **Step 3: 최소 구현 작성**

Create `lib/completion.ts`:

```ts
export type CountableConversation = {
  isArchived: boolean
  rootConversationId: string | null
  mode: string
}

export type ConversationCounts = {
  activeCount: number
  archivedCount: number
}

export function aggregateCounts(conversations: CountableConversation[]): ConversationCounts {
  let activeCount = 0
  let archivedCount = 0
  for (const c of conversations) {
    if (c.rootConversationId !== null) continue
    if (c.mode === 'assistant') continue
    if (c.isArchived) archivedCount++
    else activeCount++
  }
  return { activeCount, archivedCount }
}

export function isCompleted(counts: ConversationCounts): boolean {
  return counts.activeCount === 0 && counts.archivedCount > 0
}

export function hasArchived(counts: ConversationCounts): boolean {
  return counts.archivedCount > 0
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/completion.test.ts`
Expected: PASS — 9 tests passed

- [ ] **Step 5: 커밋**

```bash
git add lib/completion.ts lib/completion.test.ts
git commit -m "Feat: 완결 판정 순수 로직 추가"
```

---

## Task 2: `GET /api/characters` 완결 필드 추가

**Files:**
- Modify: `app/api/characters/route.ts`

- [ ] **Step 1: import 추가**

`app/api/characters/route.ts` 최상단 import 블록에 추가:

```ts
import { aggregateCounts, isCompleted, hasArchived, type CountableConversation } from '@/lib/completion'
```

- [ ] **Step 2: 캐릭터별 대화 집계 조회 + 결과 매핑 수정**

기존 `const result = characters.map(...)` 블록 (현재 51~58행)을 아래로 교체:

```ts
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
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음, 종료코드 0

- [ ] **Step 4: 커밋**

```bash
git add app/api/characters/route.ts
git commit -m "Feat: GET /api/characters 응답에 completed/hasArchived 추가"
```

---

## Task 3: `GET /api/collections` 완결 필드 + 캐릭터 뱃지

**Files:**
- Modify: `app/api/collections/route.ts`

- [ ] **Step 1: import 추가**

`app/api/collections/route.ts` 최상단에 추가:

```ts
import { aggregateCounts, isCompleted, type CountableConversation } from '@/lib/completion'
```

- [ ] **Step 2: 컬렉션 단위 대화 집계 + 결과 매핑 수정**

기존 `const result = collections.map(...)` 블록 (현재 64~67행)을 아래로 교체:

```ts
  // 컬렉션 단위 대화 집계 (소속 캐릭터 기준). 한 대화에 같은 컬렉션 캐릭터가 둘 이상이어도 1회만 집계.
  const collectionConvLinks = collectionIds.length > 0
    ? await prisma.conversationCharacter.findMany({
        where: { conversation: { userId }, character: { collectionId: { in: collectionIds } } },
        select: {
          characterId: true,
          character: { select: { collectionId: true } },
          conversation: { select: { id: true, isArchived: true, rootConversationId: true, mode: true } },
        },
      })
    : []

  const convsByCollection = new Map<string, Map<string, CountableConversation>>()
  const archivedCharIds = new Set<string>()
  for (const link of collectionConvLinks) {
    const colId = link.character.collectionId
    if (!colId) continue
    const map = convsByCollection.get(colId) ?? new Map<string, CountableConversation>()
    map.set(link.conversation.id, link.conversation)
    convsByCollection.set(colId, map)
    const cv = link.conversation
    if (cv.isArchived && cv.rootConversationId === null && cv.mode !== 'assistant') {
      archivedCharIds.add(link.characterId)
    }
  }

  const result = collections.map(c => {
    const convMap = convsByCollection.get(c.id)
    const counts = aggregateCounts(convMap ? Array.from(convMap.values()) : [])
    return {
      ...c,
      lorebookTitles: lorebookTitlesByCollection.get(c.id) ?? [],
      completed: isCompleted(counts),
      characters: c.characters.map(ch => ({ ...ch, hasArchived: archivedCharIds.has(ch.id) })),
    }
  })
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음, 종료코드 0

- [ ] **Step 4: 커밋**

```bash
git add app/api/collections/route.ts
git commit -m "Feat: GET /api/collections 응답에 completed + 캐릭터 hasArchived 추가"
```

---

## Task 4: `POST /api/characters/[id]/duplicate` 복제 엔드포인트

**Files:**
- Create: `app/api/characters/[id]/duplicate/route.ts`

- [ ] **Step 1: 라우트 작성**

Create `app/api/characters/[id]/duplicate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const source = await prisma.character.findUnique({ where: { id: params.id } })
  if (!source) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
  if (source.isPreset || source.creatorId !== userId) {
    return NextResponse.json({ error: '복제 권한이 없습니다.' }, { status: 403 })
  }

  const created = await prisma.$transaction(async (tx) => {
    const dup = await tx.character.create({
      data: {
        name: `${source.name} (복제)`.slice(0, 100),
        gender: source.gender,
        avatarUrl: source.avatarUrl,
        tags: source.tags,
        additionalInfo: source.additionalInfo,
        exampleDialogues: source.exampleDialogues,
        openingMessage: source.openingMessage,
        openingMessages: (source.openingMessages ?? undefined) as any,
        safetyLevel: source.safetyLevel,
        temperature: source.temperature,
        frequencyPenalty: source.frequencyPenalty,
        maxOutputTokens: source.maxOutputTokens,
        thinkingBudget: source.thinkingBudget,
        defaultAI: source.defaultAI,
        relatedImages: source.relatedImages,
        creatorId: userId,
        collectionId: null,
        isPreset: false,
        isAutoCreated: false,
      },
    })

    const lorebooks = await tx.lorebook.findMany({ where: { characterId: params.id } })
    for (const lb of lorebooks) {
      await tx.lorebook.create({
        data: {
          scope: lb.scope,
          scopeId: dup.id,
          keyword: lb.keyword,
          content: lb.content,
          priority: lb.priority,
          scanDepth: lb.scanDepth,
          isEnabled: lb.isEnabled,
          characterId: dup.id,
        },
      })
    }

    return dup
  })

  return NextResponse.json(created, { status: 201 })
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음, 종료코드 0

- [ ] **Step 3: 커밋**

```bash
git add app/api/characters/[id]/duplicate/route.ts
git commit -m "Feat: 캐릭터 복제 엔드포인트 추가"
```

---

## Task 5: 캐릭터 선택 페이지 진행/완결 탭

**Files:**
- Modify: `types/index.ts:23-41`
- Modify: `app/(main)/characters/page.tsx`

- [ ] **Step 1: Character 타입에 완결 필드 추가**

`types/index.ts`의 `Character` 인터페이스에서 `collection?: CharacterCollection | null` 다음 줄에 추가:

```ts
  collection?: CharacterCollection | null
  completed?: boolean
  hasArchived?: boolean
```

- [ ] **Step 2: 상태 + 복제 핸들러 추가**

`app/(main)/characters/page.tsx`에서 `const [confirmBulk, setConfirmBulk] = useState(false)` 다음 줄에 추가:

```ts
  const [view, setView] = useState<'active' | 'completed'>('active')
  const [duplicating, setDuplicating] = useState(false)
```

그리고 `const exitSelect = ...` 정의 다음에 복제 핸들러 추가:

```ts
  const handleDuplicate = async (id: string) => {
    if (duplicating) return
    setDuplicating(true)
    try {
      await api.post(`/api/characters/${id}/duplicate`, {})
      const refreshed = await api.get('/api/characters')
      setCharacters(refreshed)
      setView('active')
    } catch (e: any) {
      setError(e.message ?? '복제 중 오류가 발생했습니다.')
    } finally {
      setDuplicating(false)
    }
  }
```

- [ ] **Step 3: filteredCharacters에 view 반영**

기존 `filteredCharacters` useMemo (현재 77~81행)를 교체:

```ts
  const filteredCharacters = useMemo(() => {
    if (view === 'completed') return characters.filter(c => c.completed)
    const active = characters.filter(c => !c.completed)
    if (collectionFilter === 'all') return active
    if (collectionFilter === 'none') return active.filter(c => !c.collection && !c.isPreset)
    return active.filter(c => c.collection?.id === collectionFilter)
  }, [characters, collectionFilter, view])
```

- [ ] **Step 4: 진행/완결 탭 토글 추가**

`{error && ...}` 줄 (현재 194행) 바로 앞에 탭 토글 삽입:

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

- [ ] **Step 5: 완결 탭에서 상단 액션/컬렉션 필터/미리보기 숨기기**

(5a) 상단 우측 액션 영역에서 완결 탭일 때 "선택/만들기/다음"을 숨긴다. 현재 `) : (` 다음의 `<>...</>` 비선택 블록(현재 175~190행)을 아래로 교체:

```tsx
            ) : view === 'completed' ? null : (
              <>
                {selectableInFilter.length > 0 && (
                  <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => setSelecting(true)}>☑ 선택</button>
                )}
                <button className="btn" style={{ fontSize: 11 }} onClick={() => router.push('/characters/new')}>+ 만들기</button>
                <button
                  className="btn primary"
                  style={{ fontSize: 11 }}
                  disabled={!draft.charId}
                  onClick={() => router.push('/conversations/new')}
                >
                  다음 →
                </button>
              </>
            )}
```

(5b) 컬렉션 필터 행과 선택 미리보기 바를 완결 탭에서 숨긴다. `{collections.length > 0 && (` 를 `{view === 'active' && collections.length > 0 && (` 로, `{selectedChar && !selecting && (` 를 `{view === 'active' && selectedChar && !selecting && (` 로 수정.

- [ ] **Step 6: 완결 탭 카드 렌더 분기 (뱃지 + 복제/삭제)**

캐릭터 그리드 `{filteredCharacters.map(c => {` 내부에서, 완결 탭일 때 별도 카드를 그린다. `const isChecked = selected.has(c.id)` 다음에 조기 분기 추가:

```tsx
            const isChecked = selected.has(c.id)
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

- [ ] **Step 7: 완결 탭에서 "커스텀 만들기" 카드 숨기기**

그리드 끝의 `{!selecting && (` (커스텀 만들기 카드) 를 `{view === 'active' && !selecting && (` 로 수정.

- [ ] **Step 8: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음, 종료코드 0

- [ ] **Step 9: 커밋**

```bash
git add types/index.ts app/(main)/characters/page.tsx
git commit -m "Feat: 캐릭터 선택 페이지 진행/완결 탭 + 복제"
```

---

## Task 6: ZETA 센터 진행/완결 탭

**Files:**
- Modify: `app/(zeta)/zeta/page.tsx`

- [ ] **Step 1: Plot 인터페이스에 completed 추가**

`interface Plot {` 블록에 `zetaMeta?: any` 다음 줄로 추가:

```ts
  zetaMeta?: any
  completed?: boolean
```

- [ ] **Step 2: view 상태 추가**

`const [plots, setPlots] = useState<Plot[]>([])` 다음 줄에 추가:

```ts
  const [view, setView] = useState<'active' | 'completed'>('active')
```

- [ ] **Step 3: 탭 토글 + 필터 적용**

`{msg && ...}` 줄 다음, `<div className="zeta-scroll">` 바로 앞에 탭 삽입:

```tsx
      <div className="zeta-tabs" style={{ display: 'flex', gap: 6, padding: '8px 16px' }}>
        <button className="zeta-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--z-accent)' : 'var(--z-surface-2)', color: view === 'active' ? '#fff' : 'var(--z-ink-soft)' }} onClick={() => setView('active')}>진행 중</button>
        <button className="zeta-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--z-accent)' : 'var(--z-surface-2)', color: view === 'completed' ? '#fff' : 'var(--z-ink-soft)' }} onClick={() => setView('completed')}>완결</button>
      </div>
```

그리고 `{plots.map(p => {` 를 아래로 교체하여 view로 필터:

```tsx
            {plots.filter(p => view === 'completed' ? p.completed : !p.completed).map(p => {
```

- [ ] **Step 4: 완결 카드 뱃지**

`<div key={p.id} className="zeta-card"` 의 여는 태그 바로 다음 줄(`{thumb ? ...}` 앞)에 추가:

```tsx
                  {p.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음, 종료코드 0

- [ ] **Step 6: 커밋**

```bash
git add app/(zeta)/zeta/page.tsx
git commit -m "Feat: ZETA 센터 진행/완결 탭"
```

---

## Task 7: MELTING 센터 진행/완결 탭

**Files:**
- Modify: `app/(melting)/melting/page.tsx`

- [ ] **Step 1: MChar 인터페이스에 completed 추가**

`interface MChar {` 블록의 `characters: ...` 다음 줄에 추가:

```ts
  characters: { id: string; name: string; avatarUrl: string | null }[]
  completed?: boolean
```

- [ ] **Step 2: view 상태 추가**

`const [chars, setChars] = useState<MChar[]>([])` 다음 줄에 추가:

```ts
  const [view, setView] = useState<'active' | 'completed'>('active')
```

- [ ] **Step 3: 탭 토글 추가**

`{msg && ...}` 줄 다음, `<div className="melting-scroll">` 바로 앞에 삽입:

```tsx
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px' }}>
        <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'active' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => setView('active')}>진행 중</button>
        <button className="melting-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--m-accent)' : 'var(--m-surface-2)', color: view === 'completed' ? '#fff' : 'var(--m-ink-soft)' }} onClick={() => setView('completed')}>완결</button>
      </div>
```

- [ ] **Step 4: 필터 적용 + 빈 상태 처리**

`) : chars.length === 0 ? (` ~ 카드 그리드 시작 부분에서, 필터된 목록을 쓰도록 `{chars.map(c => {` 를 교체:

```tsx
            {chars.filter(c => view === 'completed' ? c.completed : !c.completed).map(c => {
```

- [ ] **Step 5: 완결 카드 뱃지**

`<div key={c.id} className="melting-card"` 여는 태그 다음 줄(`{thumb ? ...}` 앞)에 추가. 카드에 `position: relative`가 필요하므로 style도 함께 지정:

기존:
```tsx
                <div key={c.id} className="melting-card"
                  onClick={() => !editMode && router.push(`/melting/characters/${c.id}`)}>
                  {thumb ? <img className="melting-card-img" src={thumb} alt="" /> : <div className="melting-card-img" />}
```
교체:
```tsx
                <div key={c.id} className="melting-card" style={{ position: 'relative' }}
                  onClick={() => !editMode && router.push(`/melting/characters/${c.id}`)}>
                  {c.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--m-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
                  {thumb ? <img className="melting-card-img" src={thumb} alt="" /> : <div className="melting-card-img" />}
```

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음, 종료코드 0

- [ ] **Step 7: 커밋**

```bash
git add app/(melting)/melting/page.tsx
git commit -m "Feat: MELTING 센터 진행/완결 탭"
```

---

## Task 8: WHIF 센터 진행/완결 탭 (세계관 단위 + 캐릭터 뱃지)

**Files:**
- Modify: `app/(whif)/whif/page.tsx`

- [ ] **Step 1: 인터페이스에 필드 추가**

`interface Character {` 에 `collection?: { id: string } | null` 다음 줄로 `hasArchived?: boolean` 추가, `interface Universe {` 에 `completed?: boolean` 추가:

```ts
interface Character { id: string; name: string; avatarUrl: string | null; additionalInfo: string; tags: string[]; collection?: { id: string } | null; hasArchived?: boolean }
interface Universe { id: string; title: string; coverImageUrl: string; tags: string[]; characters: { id: string; name: string; avatarUrl: string | null }[]; completed?: boolean }
```

- [ ] **Step 2: view 상태 + 완결 세계관 ID 집합**

`const [tab, setTab] = useState<'characters' | 'universes'>('universes')` 다음 줄에 추가:

```ts
  const [view, setView] = useState<'active' | 'completed'>('active')
```

`return (` 직전(컴포넌트 함수 본문 내, `createUniverse` 정의 다음)에 파생 값 추가:

```ts
  const completedColIds = new Set(universes.filter(u => u.completed).map(u => u.id))
  const isCharCompleted = (c: Character) => !!(c.collection && completedColIds.has(c.collection.id))
```

- [ ] **Step 3: 진행/완결 탭 토글 추가**

기존 작품/캐릭터 탭 블록(`<div className="whif-tabs">...</div>`, 현재 95~98행) 다음 줄에 view 토글 삽입:

```tsx
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0' }}>
        <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'active' ? 'var(--w-accent)' : 'var(--w-surface)', color: view === 'active' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => setView('active')}>진행 중</button>
        <button className="whif-chip" style={{ cursor: 'pointer', border: 'none', background: view === 'completed' ? 'var(--w-accent)' : 'var(--w-surface)', color: view === 'completed' ? '#fff' : 'var(--w-ink-soft)' }} onClick={() => setView('completed')}>완결</button>
      </div>
```

- [ ] **Step 4: 작품(universes) 그리드에 view 필터**

`{universes.map(u => {` 를 교체:

```tsx
              {universes.filter(u => view === 'completed' ? u.completed : !u.completed).map(u => {
```

그리고 작품 카드 여는 태그 `<div key={u.id} className="whif-card" style={{ position: 'relative' }}` 다음 줄에 뱃지 추가:

```tsx
                    {u.completed && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
```

- [ ] **Step 5: 캐릭터 그리드에 view 필터(세계관 단위) + 캐릭터 뱃지**

`{characters.map(c => (` 를 교체:

```tsx
              {characters.filter(c => view === 'completed' ? isCharCompleted(c) : !isCharCompleted(c)).map(c => (
```

그리고 캐릭터 카드 여는 태그 `<div key={c.id} className="whif-card" style={{ position: 'relative' }}` 다음 줄에 뱃지 추가:

```tsx
                  {c.hasArchived && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: 9, fontWeight: 700, background: 'var(--w-accent)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>완결</div>}
```

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit`
Expected: 출력 없음, 종료코드 0

- [ ] **Step 7: 커밋**

```bash
git add app/(whif)/whif/page.tsx
git commit -m "Feat: WHIF 센터 진행/완결 탭(세계관 단위) + 캐릭터 완결 뱃지"
```

---

## 배포 (전체 태스크 완료 후)

CLAUDE.md 2단계 배포:

```bash
# 1. apps/web 서브모듈
cd apps/web && git push origin main
# 2. 부모 레포 포인터
cd ../.. && git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (완결 상태 관리 기능)" && git push origin master
```

배포 후 런타임 검증 체크리스트:
- [ ] 진행 중 대화가 있는 캐릭터 → /characters 진행 중 탭에 표시, 완결 탭에 없음
- [ ] 그 대화를 서재로 보냄 → 완결 탭으로 이동, "완결" 뱃지 표시
- [ ] 서재에서 꺼냄 → 진행 중 탭으로 복귀
- [ ] 완결 캐릭터 복제 → 일반 목록(진행 중)에 "(복제)" 캐릭터 생성
- [ ] ZETA/MELTING: 컬렉션의 활성 대화 0 → 완결 탭, 새 대화 시작 → 진행 탭 복귀
- [ ] WHIF: 한 캐릭터 대화 완결 → 같은 세계관 캐릭터/작품 모두 완결 탭, 해당 캐릭터에 뱃지
```
