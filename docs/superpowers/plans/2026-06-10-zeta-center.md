# Zeta 센터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** zeta-ai.io 플롯을 공개 REST API로 가져와 Zeta 앱과 동일한 UI로 탐색·관리하는 독립 Zeta 센터를 만든다.

**Architecture:** 새 route group `(zeta)`(목록 + 플롯 상세), `.zeta-*` 전용 CSS, `CharacterCollection.zetaMeta Json?`에 원본 plot JSON 통째 보존. `captureZeta`를 `https://api.zeta-ai.io/v1/plots/{id}` 직접 호출로 교체하고 순수 변환 함수 `buildZetaCaptured`로 `AssembledResult` 조립(AI 분류기 우회). 채팅방·페르소나 흐름은 기존 재사용.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, React, vitest(node).

**참고 spec:** `docs/superpowers/specs/2026-06-10-zeta-center-design.md`

---

## 파일 구조

| 파일 | 책임 | 변경 |
|---|---|---|
| `prisma/schema.prisma` | `CharacterCollection.zetaMeta Json?` 추가 | Modify |
| `lib/import/types.ts` | `Captured.zetaMeta?` 추가 | Modify |
| `lib/import/zeta.ts` | 순수 변환: plot JSON → `Captured` (`buildZetaCaptured`, `normalizeGuest`, `buildZetaOpenings`) | Create |
| `lib/import/zeta.test.ts` | `buildZetaCaptured` 단위 테스트 | Create |
| `lib/import/capture.ts` | `captureZeta` 재작성(REST API 호출) + 죽은 헬퍼 제거 | Modify |
| `app/api/characters/import/route.ts` | `isZeta` 분기, `zetaMeta` 저장, immersive 동작 공유 | Modify |
| `app/api/characters/route.ts` | `isZeta` 필터 + 일반목록서 zeta 제외 | Modify |
| `app/api/collections/route.ts` | `isZeta` 필터 + 일반목록서 zeta 제외 | Modify |
| `app/globals.css` | `.zeta-*` 클래스 신규 | Modify |
| `app/(zeta)/layout.tsx` | Zeta 루트 레이아웃 | Create |
| `app/(zeta)/zeta/page.tsx` | 플롯 목록 | Create |
| `app/(zeta)/zeta/plots/[id]/page.tsx` | 플롯 상세 | Create |
| `components/ui/WhifPersonaModal.tsx` | 추천 프리필 props 추가 | Modify |
| `app/(main)/page.tsx` | "ZETA 센터" 진입 버튼 | Modify |
| `app/api/debug/capture/route.ts` + `renderZetaRaw`/`renderWhifRaw` | 디버그 코드 제거(cleanup) | Delete/Modify |

---

## Task 1: 스키마 + 타입에 zetaMeta 추가

**Files:**
- Modify: `prisma/schema.prisma` (model CharacterCollection)
- Modify: `lib/import/types.ts` (interface Captured)

- [ ] **Step 1: `CharacterCollection`에 zetaMeta 컬럼 추가**

`prisma/schema.prisma`의 `model CharacterCollection { ... }` 안, `tags` 줄 아래에 추가:

```prisma
  tags           String[]      @default([])
  zetaMeta       Json?
  createdAt      DateTime      @default(now())
```

- [ ] **Step 2: `Captured`에 zetaMeta 필드 추가**

`lib/import/types.ts`의 `Captured` 인터페이스 수정:

```ts
export interface Captured {
  sections: CapturedSection[]
  title: string
  imageUrl: string
  universeUrl?: string
  loreUrls?: { url: string; name: string }[]
  assembledResult?: AssembledResult
  lorebooks?: { keyword: string[]; content: string; priority?: number }[]
  zetaMeta?: any
}
```

- [ ] **Step 3: Prisma client 재생성 + 타입 확인**

Run: `cd C:/StoryFit/apps/web && npx prisma generate`
Expected: `Generated Prisma Client` 출력, 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add prisma/schema.prisma lib/import/types.ts
git commit -m "Feat: CharacterCollection.zetaMeta 컬럼 + Captured.zetaMeta 타입 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Zeta 순수 변환 함수 (TDD)

**Files:**
- Create: `lib/import/zeta.ts`
- Create: `lib/import/zeta.test.ts`

핵심 변환 규칙:
- `intros[].conversation.messages[]`의 `content`를 `\n\n`으로 join → 도입부 1개.
- Zeta API는 `{{user}}`를 "Guest"로 미리 치환해 내려줌 → `normalizeGuest`로 "Guest"를 `{{user}}`로 되돌림.
- `Captured.title`은 빈 문자열로 둔다 — runImport가 `captured.title`로 캐릭터명을 덮어쓰는 로직(플롯명이 캐릭터명이 아닐 수 있음: "마라고 2학년 11반")을 피하기 위함. 표시용 제목은 `assembledResult.title`(=plot.name)에 둔다.
- `universeUrl` = canonical plot URL → 중복 import 방지 키(기존 필드 재사용).

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/import/zeta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildZetaCaptured, normalizeGuest } from './zeta'

const PLOT = {
  id: '7672da02-d9df-42d1-ba70-894cd25f7369',
  name: '한윤재',
  imageUrl: 'https://image.zeta-ai.io/plot-cover.png',
  shortDescription: '학교의 카사노바가 내 남자친구다',
  longDescription: '윤재와 Guest은 오래전부터 함께였다',
  unlimitedAllowed: true,
  hashtags: ['대형견', '소꿉친구'],
  characters: [
    {
      id: 'e177e4e5-6648-4f7a-bea2-466cc1e03b7e',
      name: '한윤재',
      description: '192cm 남성. Guest을 진심으로 좋아한다.',
      imageUrl: 'https://image.zeta-ai.io/profile.png',
    },
  ],
  chatProfiles: [
    { id: 'cp1', name: '{{user}}', summary: '유저 공가능', description: '나이:22살', imageUrl: 'https://x/u.png' },
  ],
  intros: [
    {
      conversation: {
        messages: [
          { type: 'text', content: '*Guest의 원룸은 고요했다.*', senderType: 'BOT', senderId: '_NARRATOR_' },
          { type: 'text', content: '"야 나 잘건데 어깨 좀 빌려줘."', senderType: 'BOT', senderId: 'e177e4e5-6648-4f7a-bea2-466cc1e03b7e' },
        ],
        cyoaChoices: null,
      },
    },
  ],
}

describe('normalizeGuest', () => {
  it('Guest를 {{user}}로 치환한다', () => {
    expect(normalizeGuest('Guest의 방')).toBe('{{user}}의 방')
  })
  it('Guest가 없으면 그대로', () => {
    expect(normalizeGuest('윤재의 방')).toBe('윤재의 방')
  })
})

describe('buildZetaCaptured', () => {
  const cap = buildZetaCaptured(PLOT, 'https://zeta-ai.io/ko/plots/7672da02-d9df-42d1-ba70-894cd25f7369/profile')

  it('title은 빈 문자열(캐릭터명 덮어쓰기 방지)', () => {
    expect(cap.title).toBe('')
  })
  it('universeUrl은 canonical 플롯 URL', () => {
    expect(cap.universeUrl).toContain('zeta-ai.io')
    expect(cap.universeUrl).toContain('7672da02')
  })
  it('zetaMeta에 원본 plot 전체 보존', () => {
    expect(cap.zetaMeta).toBe(PLOT)
  })
  it('assembledResult.title은 plot.name', () => {
    expect(cap.assembledResult!.title).toBe('한윤재')
  })
  it('hashtags가 tags로 매핑', () => {
    expect(cap.assembledResult!.tags).toEqual(['대형견', '소꿉친구'])
  })
  it('unlimitedAllowed=true면 safetyLevel=relaxed', () => {
    expect(cap.assembledResult!.safetyLevel).toBe('relaxed')
  })
  it('캐릭터 description의 Guest가 치환됨', () => {
    expect(cap.assembledResult!.characters[0].additionalInfo).toContain('{{user}}')
    expect(cap.assembledResult!.characters[0].additionalInfo).not.toContain('Guest')
  })
  it('캐릭터 avatarUrl은 character.imageUrl', () => {
    expect(cap.assembledResult!.characters[0].avatarUrl).toBe('https://image.zeta-ai.io/profile.png')
  })
  it('인트로 메시지들이 openingMessage로 join되고 Guest 치환됨', () => {
    const op = cap.assembledResult!.characters[0].openingMessage
    expect(op).toContain('{{user}}의 원룸')
    expect(op).toContain('어깨 좀 빌려줘')
    expect(op).toContain('\n\n')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd C:/StoryFit/apps/web && npx vitest run lib/import/zeta.test.ts`
Expected: FAIL — `Failed to resolve import "./zeta"` (파일 없음).

- [ ] **Step 3: `lib/import/zeta.ts` 구현**

```ts
import type { Captured, AssembledCharacter } from './types'

export function normalizeGuest(text: string): string {
  return text.split('Guest').join('{{user}}')
}

function buildZetaOpenings(intros: any): { id: string; title: string; content: string }[] {
  if (!Array.isArray(intros)) return []
  return intros
    .map((intro, idx) => {
      const messages = intro?.conversation?.messages ?? []
      const content = (Array.isArray(messages) ? messages : [])
        .map((m: any) => String(m?.content ?? ''))
        .filter(Boolean)
        .join('\n\n')
      return {
        id: `intro_${idx}`,
        title: idx === 0 ? '기본 도입부' : `도입부 ${idx + 1}`,
        content: normalizeGuest(content),
      }
    })
    .filter(o => o.content.trim().length > 0)
}

export function buildZetaCaptured(plot: any, canonicalUrl: string): Captured {
  const rawChars = Array.isArray(plot.characters) ? plot.characters : []
  const hashtags = Array.isArray(plot.hashtags) ? plot.hashtags : []
  const openings = buildZetaOpenings(plot.intros)
  const safetyLevel = plot.unlimitedAllowed ? 'relaxed' : 'standard'

  const characters: AssembledCharacter[] = rawChars.map((c: any, i: number) => ({
    name: c.name || plot.name || '캐릭터',
    gender: '',
    tags: hashtags,
    additionalInfo: normalizeGuest(String(c.description ?? '')),
    openingMessage: i === 0 ? (openings[0]?.content ?? '') : '',
    openingMessages: i === 0 && openings.length > 1 ? openings : undefined,
    exampleDialogues: '',
    avatarUrl: c.imageUrl || '',
  }))

  if (characters.length === 0) {
    characters.push({
      name: plot.name || '캐릭터',
      gender: '',
      tags: hashtags,
      additionalInfo: normalizeGuest(String(plot.longDescription ?? '')),
      openingMessage: openings[0]?.content ?? '',
      openingMessages: openings.length > 1 ? openings : undefined,
      exampleDialogues: '',
      avatarUrl: plot.imageUrl || '',
    })
  }

  return {
    sections: [],
    title: '',
    imageUrl: plot.imageUrl || rawChars[0]?.imageUrl || '',
    universeUrl: canonicalUrl,
    assembledResult: {
      characters,
      scenarioDescription: normalizeGuest(String(plot.longDescription ?? '')),
      tags: hashtags,
      title: plot.name || '캐릭터',
      safetyLevel,
      coverImageUrl: plot.imageUrl || '',
    },
    zetaMeta: plot,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd C:/StoryFit/apps/web && npx vitest run lib/import/zeta.test.ts`
Expected: PASS — 모든 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
cd C:/StoryFit/apps/web
git add lib/import/zeta.ts lib/import/zeta.test.ts
git commit -m "Feat: Zeta plot JSON -> Captured 순수 변환 함수 + 테스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: captureZeta REST API 호출로 재작성

**Files:**
- Modify: `lib/import/capture.ts` (`captureZeta` 함수 본문 교체, `renderZetaRaw` 임시함수 유지는 Task 10에서 제거)

- [ ] **Step 1: `buildZetaCaptured` import 추가**

`lib/import/capture.ts` 상단 import 구역에 추가:

```ts
import { buildZetaCaptured } from './zeta'
```

- [ ] **Step 2: `captureZeta` 본문 전체 교체**

기존 `export async function captureZeta(url: string): Promise<Captured> { ... }` 전체를 아래로 교체:

```ts
export async function captureZeta(url: string): Promise<Captured> {
  const plotId = url.match(/\/plots\/([0-9a-f-]{36})/i)?.[1]
  if (!plotId) throw new Error('Zeta 플롯 URL이 아닙니다 (/plots/{id} 형식 필요)')

  const res = await fetch(`https://api.zeta-ai.io/v1/plots/${plotId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Zeta API 오류 (HTTP ${res.status})`)

  const plot = await res.json()
  if (!plot?.id) throw new Error('Zeta 플롯 데이터를 찾을 수 없습니다')

  const canonical = `https://zeta-ai.io/ko/plots/${plot.id}/profile`
  return buildZetaCaptured(plot, canonical)
}
```

- [ ] **Step 3: 죽은 Zeta 헬퍼 사용처 확인**

Run: `cd C:/StoryFit/apps/web && grep -rn "extractZetaIntroText\|preprocessZetaText\|cleanZetaText\|extractZetaPlotImage\|extractLorebookUrls" lib app`
Expected: `captureZeta` 안에서 더는 호출되지 않음. 다른 곳에서 사용처가 없는 함수만 식별. (사용처가 있으면 남겨둔다.)

- [ ] **Step 4: 사용처 없는 헬퍼 제거**

Step 3에서 어디에서도 호출되지 않는 것으로 확인된 함수 정의를 `lib/import/capture.ts`에서 삭제한다. (호출이 하나라도 있으면 남겨둔다 — 임의 추정 금지.)

- [ ] **Step 5: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
cd C:/StoryFit/apps/web
git add lib/import/capture.ts
git commit -m "Feat: captureZeta를 공개 REST API 직접 호출로 재작성

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: import route — isZeta 분기 + zetaMeta 저장

**Files:**
- Modify: `app/api/characters/import/route.ts` (`runImport` 함수)

`isWhif`이 쓰이던 immersive 동작(태그 출처, roleplay/tikiTaka 모드, 로어북 이중 스코프)을 Zeta에도 적용한다. `relatedImages`는 WHIF 전용으로 유지. `zetaMeta`는 Zeta일 때만 저장.

- [ ] **Step 1: isZeta / isImmersive 플래그 추가**

`runImport` 내 `const isWhif = matchesHost(url, 'whif.io', 'whif.club')` 줄 아래에 추가:

```ts
  const isWhif = matchesHost(url, 'whif.io', 'whif.club')
  const isZeta = matchesHost(url, 'zeta-ai.io')
  const isImmersive = isWhif || isZeta
```

- [ ] **Step 2: 캐릭터 생성 — 태그 출처를 isImmersive로**

`prisma.character.create` 의 data에서:

```ts
          tags: isImmersive ? (c.tags ?? []) : result.tags,
          relatedImages: isWhif ? (c.relatedImages ?? []) : [],
```

(`relatedImages`는 그대로 `isWhif`.)

- [ ] **Step 3: 대화 모드 — isImmersive로**

`prisma.conversation.create`의 data에서 `mode` 줄을 수정:

```ts
      mode: isImmersive
        ? (isMulti ? 'tikiTaka' : 'roleplay')
        : (isMulti ? 'multiStory' : 'story'),
```

- [ ] **Step 4: collection 생성 시 zetaMeta 저장**

`prisma.characterCollection.create`의 data에 `zetaMeta` 추가:

```ts
  const collection = await prisma.characterCollection.create({
    data: {
      title: collectionTitle,
      sourceUrl: captured.universeUrl ?? url,
      userId,
      conversationId: conversation.id,
      coverImageUrl: result.coverImageUrl ?? '',
      description: result.scenarioDescription ?? '',
      tags: result.tags ?? [],
      ...(captured.zetaMeta ? { zetaMeta: captured.zetaMeta } : {}),
    },
  })
```

- [ ] **Step 5: 로어북 스코프 — isImmersive로**

로어북 저장 블록의 `if (isWhif) { ... } else { ... }`를 `if (isImmersive) { ... } else { ... }`로 변경. (Zeta도 collection+conversation 이중 스코프 사용.)

- [ ] **Step 6: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 7: 커밋**

```bash
cd C:/StoryFit/apps/web
git add app/api/characters/import/route.ts
git commit -m "Feat: import route에 Zeta 분기 + zetaMeta 저장

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: API 필터 — isZeta 추가 + 일반 목록서 zeta 제외

**Files:**
- Modify: `app/api/characters/route.ts` (GET)
- Modify: `app/api/collections/route.ts` (GET)

- [ ] **Step 1: characters GET whereClause 재작성**

`app/api/characters/route.ts`의 `const isWhif = ...`부터 `whereClause` 정의까지를 아래로 교체:

```ts
  const source = searchParams.get('isWhif') === 'true' ? 'whif'
    : searchParams.get('isZeta') === 'true' ? 'zeta'
    : 'regular'

  const whereClause =
    source === 'whif'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'whif.' } } }
    : source === 'zeta'
      ? { creatorId: userId, collection: { sourceUrl: { contains: 'zeta-ai.io' } } }
      : {
          OR: [
            { isPreset: true },
            {
              creatorId: userId,
              OR: [
                { collectionId: null },
                {
                  collection: {
                    AND: [
                      { NOT: { sourceUrl: { contains: 'whif.' } } },
                      { NOT: { sourceUrl: { contains: 'zeta-ai.io' } } },
                    ],
                  },
                },
              ],
            },
          ],
        }
```

- [ ] **Step 2: collections GET whereClause 재작성**

`app/api/collections/route.ts`의 `const isWhif = ...`부터 `if (isWhif) {...} else {...}` 블록까지를 아래로 교체:

```ts
  const source = searchParams.get('isWhif') === 'true' ? 'whif'
    : searchParams.get('isZeta') === 'true' ? 'zeta'
    : 'regular'

  const whereClause: any = { userId }

  if (source === 'whif') {
    whereClause.sourceUrl = { contains: 'whif.' }
  } else if (source === 'zeta') {
    whereClause.sourceUrl = { contains: 'zeta-ai.io' }
  } else {
    whereClause.AND = [
      { NOT: { sourceUrl: { contains: 'whif.' } } },
      { NOT: { sourceUrl: { contains: 'zeta-ai.io' } } },
    ]
  }
```

- [ ] **Step 3: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add app/api/characters/route.ts app/api/collections/route.ts
git commit -m "Feat: characters/collections API에 isZeta 필터 + 일반목록서 zeta 분리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Zeta 전용 CSS

**Files:**
- Modify: `app/globals.css` (파일 끝에 추가)

- [ ] **Step 1: `.zeta-*` 블록 추가**

`app/globals.css` 맨 끝에 추가:

```css
/* ─── ZETA immersive (dark, scoped) ─────────────────────────────── */
.zeta-root{
  --z-bg:#0d0d0f; --z-surface:#1a1a1f; --z-surface-2:#232329; --z-line:#2c2c34;
  --z-ink:#f4f4f6; --z-ink-soft:#9a9aa6; --z-accent:#7c5cff; --z-radius:14px;
  display:flex; flex-direction:column; height:100%; min-height:0;
  background:var(--z-bg); color:var(--z-ink);
}
.zeta-scroll{ flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch;
  padding-bottom:calc(16px + env(safe-area-inset-bottom)); }
.zeta-header{ flex-shrink:0; display:flex; align-items:center; justify-content:space-between;
  padding:14px 16px; border-bottom:1px solid var(--z-line); background:var(--z-bg); }
.zeta-logo{ font-size:18px; font-weight:900; letter-spacing:.06em; color:var(--z-ink); }
.zeta-iconbtn{ background:none; border:none; color:var(--z-ink); font-size:20px; cursor:pointer; padding:4px 8px; }
.zeta-menu{ position:absolute; top:52px; right:12px; z-index:60; background:var(--z-surface-2);
  border:1px solid var(--z-line); border-radius:10px; overflow:hidden; min-width:200px; }
.zeta-menu-item{ display:block; width:100%; text-align:left; background:none; border:none;
  color:var(--z-ink); font-size:13px; padding:11px 14px; cursor:pointer; }
.zeta-menu-item:hover{ background:var(--z-surface); }
.zeta-grid{ display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; padding:16px; }
.zeta-card{ background:var(--z-surface); border:1px solid var(--z-line); border-radius:var(--z-radius);
  overflow:hidden; cursor:pointer; display:flex; flex-direction:column; position:relative; }
.zeta-card-img{ width:100%; aspect-ratio:3/4; object-fit:cover; background:var(--z-surface-2); display:block; }
.zeta-card-badge{ position:absolute; top:8px; left:8px; background:rgba(0,0,0,.6); color:#fff;
  font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; display:flex; align-items:center; gap:3px; }
.zeta-card-body{ padding:10px; display:flex; flex-direction:column; gap:6px; }
.zeta-card-title{ font-size:13px; font-weight:800; color:var(--z-ink); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.zeta-card-tags{ display:flex; flex-wrap:wrap; gap:4px; }
.zeta-chip{ display:inline-block; background:var(--z-surface-2); color:var(--z-ink-soft);
  font-size:10px; padding:2px 8px; border-radius:999px; }
.zeta-empty{ padding:48px 16px; text-align:center; color:var(--z-ink-soft); font-size:13px; line-height:1.7; }
.zeta-cover{ width:100%; aspect-ratio:1; object-fit:cover; background:var(--z-surface-2); display:block; }
.zeta-cover-wrap{ position:relative; }
.zeta-cover-handle{ position:absolute; left:14px; bottom:12px; color:#fff; font-size:13px;
  font-weight:700; text-shadow:0 1px 4px rgba(0,0,0,.6); }
.zeta-back{ background:rgba(0,0,0,.4); border:none; color:#fff; font-size:20px; cursor:pointer;
  padding:2px 10px; border-radius:999px; }
.zeta-section{ padding:16px; }
.zeta-section-title{ font-size:15px; font-weight:800; color:var(--z-ink); margin:0 0 10px; }
.zeta-charcard{ display:flex; align-items:center; gap:12px; background:var(--z-surface);
  border:1px solid var(--z-line); border-radius:12px; padding:10px 14px; }
.zeta-charcard img{ width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0; }
.zeta-intro-box{ background:var(--z-surface); border:1px solid var(--z-line); border-radius:12px;
  padding:14px; color:var(--z-ink-soft); line-height:1.7; font-size:14px; }
.zeta-creator{ display:flex; align-items:center; gap:10px; }
.zeta-creator img{ width:36px; height:36px; border-radius:999px; object-fit:cover; }
.zeta-cta{ position:sticky; bottom:0; padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  background:linear-gradient(180deg, transparent, var(--z-bg) 40%); }
.zeta-cta-btn{ width:100%; padding:14px; border:none; border-radius:12px;
  background:linear-gradient(135deg,#7c5cff,#9d6bff); color:#fff; font-size:15px; font-weight:800; cursor:pointer; }
```

- [ ] **Step 2: 커밋**

```bash
cd C:/StoryFit/apps/web
git add app/globals.css
git commit -m "Style: Zeta 센터 전용 .zeta-* 클래스 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Zeta 레이아웃 + 목록 페이지

**Files:**
- Create: `app/(zeta)/layout.tsx`
- Create: `app/(zeta)/zeta/page.tsx`

- [ ] **Step 1: 레이아웃 작성**

`app/(zeta)/layout.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppProvider } from '@/providers/AppProvider'
import { getAccessToken } from '@/lib/authClient'

export default function ZetaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => { if (!getAccessToken()) router.replace('/login') }, [])
  return (
    <AppProvider>
      <div className="zeta-root">{children}</div>
    </AppProvider>
  )
}
```

- [ ] **Step 2: 목록 페이지 작성**

`app/(zeta)/zeta/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Plot {
  id: string; title: string; coverImageUrl: string; tags: string[]
  characters: { id: string; name: string; avatarUrl: string | null }[]
  zetaMeta?: any
}

export default function ZetaListPage() {
  const router = useRouter()
  const [plots, setPlots] = useState<Plot[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('zeta_edit') === '1')
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try { setPlots(await api.get('/api/collections?isZeta=true')) }
    finally { setLoading(false) }
  }

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true); setMsg('')
    try {
      await api.post('/api/characters/import', { url: importUrl.trim() })
      setImportUrl(''); setMsg('✓ 가져왔습니다'); setMenuOpen(false)
      await fetchData()
    } catch (e: any) { setMsg('⚠ ' + (e.message ?? '가져오기 실패')) }
    finally { setImporting(false) }
  }

  const toggleEditMode = () => {
    const next = !editMode; setEditMode(next)
    localStorage.setItem('zeta_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deletePlot = async (id: string) => {
    if (!confirm('이 플롯과 소속 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  const formatCount = (n: number) =>
    n >= 10000 ? `${Math.floor(n / 10000)}만` : n >= 1000 ? `${(n / 1000).toFixed(1)}천` : String(n)

  return (
    <>
      <div className="zeta-header" style={{ position: 'relative' }}>
        <div className="zeta-logo">ZETA</div>
        <button className="zeta-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="zeta-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input className="field" placeholder="https://zeta-ai.io/ko/plots/..." value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
                style={{ fontSize: 12 }} />
              <button className="zeta-menu-item"
                style={{ background: 'var(--z-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="zeta-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div className="zeta-scroll">
        {loading ? (
          <div className="zeta-empty">불러오는 중...</div>
        ) : plots.length === 0 ? (
          <div className="zeta-empty">가져온 플롯이 없습니다<br />⋮ 메뉴에서 zeta-ai.io 플롯 URL로 가져오세요.</div>
        ) : (
          <div className="zeta-grid">
            {plots.map(p => {
              const thumb = p.coverImageUrl || p.characters[0]?.avatarUrl || ''
              const count = p.zetaMeta?.interactionCount ?? 0
              return (
                <div key={p.id} className="zeta-card"
                  onClick={() => !editMode && router.push(`/zeta/plots/${p.id}`)}>
                  {thumb ? <img className="zeta-card-img" src={thumb} alt="" /> : <div className="zeta-card-img" />}
                  {count > 0 && <div className="zeta-card-badge">💬 {formatCount(count)}</div>}
                  <div className="zeta-card-body">
                    <div className="zeta-card-title">{p.title}</div>
                    {p.tags?.length > 0 && (
                      <div className="zeta-card-tags">
                        {p.tags.slice(0, 3).map(t => <span key={t} className="zeta-chip">#{t}</span>)}
                      </div>
                    )}
                  </div>
                  {editMode && (
                    <button onClick={e => { e.stopPropagation(); deletePlot(p.id) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.7)',
                        border: 'none', color: '#ff6b8a', borderRadius: 999, width: 24, height: 24,
                        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
```

**주의:** 목록 카드의 대화수 배지는 `p.zetaMeta?.interactionCount`를 쓴다. 이를 위해 `collections` 목록 GET이 `zetaMeta`를 반환해야 한다 — Step 3에서 처리.

- [ ] **Step 3: collections 목록 GET에 zetaMeta select 추가**

`app/api/collections/route.ts`의 `findMany` `select`에 `zetaMeta: true` 추가:

```ts
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      createdAt: true,
      coverImageUrl: true,
      description: true,
      tags: true,
      zetaMeta: true,
      characters: { select: { id: true, name: true, avatarUrl: true } },
    },
```

- [ ] **Step 4: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/(zeta)/layout.tsx" "app/(zeta)/zeta/page.tsx" app/api/collections/route.ts
git commit -m "Feat: Zeta 센터 레이아웃 + 플롯 목록 페이지

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Zeta 플롯 상세 페이지 + 페르소나 프리필

**Files:**
- Modify: `components/ui/WhifPersonaModal.tsx` (추천 프리필 props)
- Create: `app/(zeta)/zeta/plots/[id]/page.tsx`

- [ ] **Step 1: WhifPersonaModal에 프리필 props 추가**

`components/ui/WhifPersonaModal.tsx`의 `interface Props`에 옵션 추가:

```ts
interface Props {
  candidates: Candidate[]
  loading?: boolean
  defaultName?: string
  defaultSettings?: string
  onCancel: () => void
  onSelect: (personaCharId: string | null, newPersona?: NewPersonaData) => void
}
```

함수 시그니처와 초기 state를 수정:

```ts
export default function WhifPersonaModal({ candidates, loading, defaultName, defaultSettings, onCancel, onSelect }: Props) {
  const [tab, setTab] = useState<'new' | 'existing'>(candidates.length > 0 ? 'existing' : 'new')
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null)
  const [name, setName] = useState(defaultName ?? '')
  const [gender, setGender] = useState('여성')
  const [settings, setSettings] = useState(defaultSettings ?? '')
  const [relationship, setRelationship] = useState('처음 만남')
```

(나머지 본문은 변경 없음.)

- [ ] **Step 2: 상세 페이지 작성**

`app/(zeta)/zeta/plots/[id]/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'

interface Opening { id: string; title: string; content: string }
interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; openingMessages?: Opening[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; zetaMeta?: any
}

function formatCount(n: number) {
  return n >= 10000 ? `${Math.floor(n / 10000)}만` : n >= 1000 ? `${(n / 1000).toFixed(1)}천` : String(n)
}
function formatDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function ZetaPlotDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  if (!col) return <div className="zeta-empty">불러오는 중...</div>

  const meta = col.zetaMeta ?? {}
  const mainChar = col.characters[0]
  const openings: Opening[] = mainChar?.openingMessages?.length
    ? mainChar.openingMessages
    : mainChar?.openingMessage?.trim()
      ? [{ id: 'default', title: '기본 도입부', content: mainChar.openingMessage }]
      : []
  const creator = meta.creator ?? null
  const chatProfile = Array.isArray(meta.chatProfiles) ? meta.chatProfiles[0] : null
  const personaDefaults = chatProfile
    ? [chatProfile.summary, chatProfile.description].filter(Boolean).join('\n')
    : ''

  const handlePersonaSelect = async (personaCharId: string | null, newPersona?: NewPersonaData) => {
    if (!mainChar) return
    setCreating(true); setError('')
    try {
      let personaId = personaCharId
      if (!personaId && newPersona) {
        const p = await api.post('/api/characters', {
          name: newPersona.name, gender: newPersona.gender, additionalInfo: newPersona.additionalInfo,
        })
        personaId = p.id
      }
      const chosen = openings[openingIdx]?.content
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'roleplay',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      setError('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
      {personaOpen && (
        <WhifPersonaModal
          candidates={[]}
          loading={creating}
          defaultSettings={personaDefaults}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="zeta-scroll">
          {/* 커버 */}
          <div className="zeta-cover-wrap">
            {col.coverImageUrl ? <img className="zeta-cover" src={col.coverImageUrl} alt="" /> : <div className="zeta-cover" />}
            <button className="zeta-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
            {creator?.username && <div className="zeta-cover-handle">@{creator.username}</div>}
          </div>

          {/* 제목/소개/대화수/태그 */}
          <div className="zeta-section">
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: 'var(--z-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {col.title}
              {meta.verified && <span title="인증됨" style={{ color: 'var(--z-accent)', fontSize: 16 }}>✓</span>}
            </h1>
            {meta.shortDescription && <p style={{ color: 'var(--z-ink-soft)', margin: '0 0 10px', fontSize: 14 }}>{meta.shortDescription}</p>}
            {meta.interactionCount > 0 && (
              <div className="zeta-chip" style={{ marginBottom: 10 }}>💬 {formatCount(meta.interactionCount)}</div>
            )}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="zeta-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {/* 캐릭터 */}
          {col.characters.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">캐릭터</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.characters.map(c => (
                  <div key={c.id} className="zeta-charcard">
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--z-line)' }} />}
                    <span style={{ fontWeight: 700 }}>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 인트로 */}
          {openings.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">인트로</h2>
              {openings.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {openings.map((op, i) => (
                    <button key={op.id} className="zeta-chip"
                      style={{ border: 'none', cursor: 'pointer', background: i === openingIdx ? 'var(--z-accent)' : 'var(--z-surface-2)', color: i === openingIdx ? '#fff' : 'var(--z-ink-soft)' }}
                      onClick={() => setOpeningIdx(i)}>{op.title}</button>
                  ))}
                </div>
              )}
              <div className="zeta-intro-box">
                <NovelText text={(openings[openingIdx]?.content ?? '')
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
              </div>
            </div>
          )}

          {/* 크리에이터 */}
          {creator && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">크리에이터</h2>
              {meta.creatorComment && (
                <p style={{ color: 'var(--z-ink-soft)', lineHeight: 1.6, margin: '0 0 10px', fontSize: 13, whiteSpace: 'pre-wrap' }}>{meta.creatorComment}</p>
              )}
              <div className="zeta-creator">
                {creator.profileImageUrl && <img src={creator.profileImageUrl} alt="" />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{creator.nickname}</div>
                  {creator.username && <div style={{ color: 'var(--z-ink-soft)', fontSize: 12 }}>@{creator.username}</div>}
                </div>
              </div>
              {(meta.createdAt || meta.updatedAt) && (
                <div style={{ color: 'var(--z-ink-soft)', fontSize: 11, marginTop: 8 }}>
                  {meta.createdAt && `출시일 ${formatDate(meta.createdAt)}`}
                  {meta.updatedAt && ` / 수정일 ${formatDate(meta.updatedAt)}`}
                </div>
              )}
            </div>
          )}

          {/* 로어북 (인라인, raw에서 표시) */}
          {Array.isArray(meta.lorebooks) && meta.lorebooks.length > 0 && (
            <div className="zeta-section" style={{ paddingTop: 0 }}>
              <h2 className="zeta-section-title">로어북</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {meta.lorebooks.map((lb: any, i: number) => (
                  <div key={i} className="zeta-charcard" style={{ cursor: 'default' }}>
                    <span style={{ fontWeight: 700 }}>📒 {lb.name ?? lb.title ?? `로어북 ${i + 1}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="zeta-cta">
          <button className="zeta-cta-btn" onClick={() => setPersonaOpen(true)} disabled={!mainChar}>대화 시작하기</button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add components/ui/WhifPersonaModal.tsx "app/(zeta)/zeta/plots/[id]/page.tsx"
git commit -m "Feat: Zeta 플롯 상세 페이지 + 페르소나 추천 프리필

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 홈 진입 버튼

**Files:**
- Modify: `app/(main)/page.tsx`

- [ ] **Step 1: 메뉴 배열에 ZETA 센터 추가**

`app/(main)/page.tsx`의 메뉴 항목 배열에서 `{ label: 'WHIF 센터', emoji: '🪐', href: '/whif' },` 줄 아래에 추가:

```ts
  { label: 'WHIF 센터', emoji: '🪐', href: '/whif' },
  { label: 'ZETA 센터', emoji: '⚡', href: '/zeta' },
```

- [ ] **Step 2: 가져오기 안내 항목에 href 추가 (선택)**

`app/(main)/page.tsx`에서 ZETA 안내 항목(`label: 'ZETA (zeta-ai.io)'`)에 `href: '/zeta'`를 추가:

```ts
      { emoji: '⚡', label: 'ZETA (zeta-ai.io)', desc: '플롯 프로필 URL을 붙여넣으면 캐릭터·설정을 자동으로 가져옵니다.', href: '/zeta' },
```

- [ ] **Step 3: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/(main)/page.tsx"
git commit -m "Feat: 홈에 ZETA 센터 진입 버튼 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 디버그 코드 정리

**Files:**
- Delete: `app/api/debug/capture/route.ts`
- Modify: `lib/import/capture.ts` (`renderZetaRaw`, `renderWhifRaw` 제거)

- [ ] **Step 1: 디버그 라우트 사용처 확인**

Run: `cd C:/StoryFit/apps/web && grep -rn "renderZetaRaw\|renderWhifRaw\|debug/capture" lib app`
Expected: `app/api/debug/capture/route.ts`와 `lib/import/capture.ts` 정의부에서만 등장.

- [ ] **Step 2: 디버그 라우트 삭제**

Run: `cd C:/StoryFit/apps/web && rm -rf app/api/debug/capture`
Expected: 삭제됨.

- [ ] **Step 3: capture.ts에서 디버그 함수 제거**

`lib/import/capture.ts`에서 `export async function renderZetaRaw(...) { ... }`와 `export async function renderWhifRaw(...) { ... }` 함수 정의를 통째로 삭제한다. (Step 1에서 외부 사용처가 없음을 확인한 경우에 한함.)

- [ ] **Step 4: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
cd C:/StoryFit/apps/web
git add -A
git commit -m "Chore: Zeta/Whif 임시 디버그 캡처 코드 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: 전체 빌드 + 배포

**Files:** 없음 (검증 + 배포)

- [ ] **Step 1: 단위 테스트 전체 실행**

Run: `cd C:/StoryFit/apps/web && npm run test`
Expected: `lib/import/zeta.test.ts` 포함 전부 PASS.

- [ ] **Step 2: 프로덕션 빌드**

Run: `cd C:/StoryFit/apps/web && npm run build`
Expected: 빌드 성공, 타입 오류 없음.

- [ ] **Step 3: 서브모듈(main) 푸시**

```bash
cd C:/StoryFit/apps/web
git push origin main
```

- [ ] **Step 4: 부모 레포(master) 서브모듈 포인터 업데이트**

```bash
cd C:/StoryFit
git add apps/web
git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (Zeta 센터)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin master
```

- [ ] **Step 5: 수동 검증 (서버 빌드 후)**

서버에서 `git pull origin master && git submodule update --remote apps/web && docker compose up --build -d` (zetaMeta 컬럼은 `db push`로 자동 반영).
브라우저에서:
1. 홈 → "ZETA 센터" 진입.
2. ⋮ → `https://zeta-ai.io/ko/plots/7672da02-d9df-42d1-ba70-894cd25f7369/profile` 가져오기 → 카드 표시 확인.
3. 카드 클릭 → 상세(커버/제목/소개/대화수/태그/캐릭터/인트로/크리에이터) 확인. 인트로에서 "Guest"가 아닌 "나"로 표시되는지 확인.
4. "대화 시작하기" → 페르소나 모달(설정 프리필) → 채팅방 진입, 첫 메시지 표시 확인.
5. 같은 URL 재가져오기 → 중복 생성 안 됨 확인.

---

## 보류 (별도 후속 — 채워진 lorebook 샘플 필요)

`plot.lorebooks`를 Lorebook DB 레코드로 변환하는 작업은 **데이터가 채워진 플롯 샘플의 구조를 확인한 뒤** 진행한다. 현재 샘플(`7672da02...`)은 `lorebooks: []`로 비어 있어 정확한 필드(키워드/내용/우선순위) 구조를 알 수 없다. 그때까지:
- **데이터 손실 없음:** 원본 `lorebooks`는 `zetaMeta`에 통째로 보존된다.
- **표시:** 상세 페이지는 `zetaMeta.lorebooks`에서 이름만 인라인으로 보여준다(Task 8).
- **후속 조사 명령:** 로어북이 있는 플롯(예: introlorebook.png의 "송주노")의 plotId로
  `curl -s "https://api.zeta-ai.io/v1/plots/{plotId}" | jq '.lorebooks'`
  를 실행해 구조를 확인한 뒤, `buildZetaCaptured`에 `captured.lorebooks` 매핑과 import route의 Lorebook 레코드 생성을 추가한다. (채팅 주입에 영향을 주는 부분이므로 구조 확인 전 추정 구현 금지.)
