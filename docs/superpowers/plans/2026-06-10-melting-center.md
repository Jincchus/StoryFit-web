# Melting 센터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** melting.chat 캐릭터를 가져와 Melting 앱과 동일한 UI(핑크 테마)로 탐색하고, 호감도 스탯·추천답변·장 카운터까지 클론한 독립 Melting 센터를 만든다.

**Architecture:** 새 route group `(melting)`(목록 + 캐릭터 상세), `.melting-*` 전용 CSS, `CharacterCollection.meltingMeta Json?`에 원본 bot JSON 보존. 호감도는 기존 `statsConfig` + `lib/storyEval.ts` 자동평가 루프를 재사용한다. "추천 답변"은 신규 엔드포인트 + 채팅방 UI, "장"은 `Conversation.chapter` 카운터로 `triggerStateTracking`에서 자동 증가시킨다. Melting 설정(호감도/추천답변)은 상세 페이지의 대화 생성 페이로드로 적용한다.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, React, vitest(node).

**참고 spec:** `docs/superpowers/specs/2026-06-10-melting-center-design.md`

---

## 파일 구조

| 파일 | 책임 | 변경 |
|---|---|---|
| `prisma/schema.prisma` | `CharacterCollection.meltingMeta`, `Conversation.chapter`/`suggestRepliesEnabled` 추가 | Modify |
| `lib/import/types.ts` | `Captured.meltingMeta?` 추가 | Modify |
| `lib/import/capture.ts` | `captureMelting`이 `meltingMeta`(bot raw) 반환 | Modify |
| `app/api/characters/import/route.ts` | `isMelting` 분기, `isImmersive`에 포함, `meltingMeta` 저장 | Modify |
| `app/api/conversations/route.ts` | POST가 `suggestRepliesEnabled` 수용 | Modify |
| `app/api/characters/route.ts` | `melting` source 필터 + 일반목록서 melting 제외 | Modify |
| `app/api/collections/route.ts` | `melting` source 필터 + 일반목록서 melting 제외 + `meltingMeta` select | Modify |
| `lib/suggestions.ts` | 추천답변 순수함수: `buildSuggestionPrompt`, `parseSuggestions` | Create |
| `lib/suggestions.test.ts` | 순수함수 단위 테스트 | Create |
| `app/api/conversations/[id]/suggestions/route.ts` | 추천답변 생성 엔드포인트 | Create |
| `lib/storyEval.ts` | `triggerStateTracking`에 `newChapter` + chapter 증가 | Modify |
| `app/globals.css` | `.melting-*` 클래스 신규 | Modify |
| `app/(melting)/layout.tsx` | Melting 루트 레이아웃 | Create |
| `app/(melting)/melting/page.tsx` | 캐릭터 목록 | Create |
| `app/(melting)/melting/characters/[id]/page.tsx` | 캐릭터 상세 + 대화 생성 | Create |
| `app/(main)/conversations/[id]/page.tsx` | 추천답변 UI + 장 뱃지 | Modify |
| `app/(main)/chatlist/page.tsx` | 장 뱃지 | Modify |
| `app/(main)/page.tsx` | "MELTING 센터" 진입 버튼 | Modify |

---

## Task 1: 스키마 + 타입에 melting 필드 추가

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/import/types.ts`

- [ ] **Step 1: `CharacterCollection`에 meltingMeta 추가**

`prisma/schema.prisma`의 `zetaMeta       Json?` (line 97) 아래에 추가:

```prisma
  zetaMeta       Json?
  meltingMeta    Json?
```

- [ ] **Step 2: `Conversation`에 chapter / suggestRepliesEnabled 추가**

`prisma/schema.prisma`의 `model Conversation`에서 아래 두 줄 사이에 추가:

```prisma
  styleConfig         Json?
  chapter                Int                  @default(1)
  suggestRepliesEnabled  Boolean              @default(false)
  isAutoCreated       Boolean                 @default(false)
```

- [ ] **Step 3: `Captured`에 meltingMeta 필드 추가**

`lib/import/types.ts`의 `Captured` 인터페이스 끝(`zetaMeta?: any` 아래)에 추가:

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
  meltingMeta?: any
}
```

- [ ] **Step 4: Prisma client 재생성**

Run: `cd C:/StoryFit/apps/web && npx prisma generate`
Expected: `Generated Prisma Client` 출력, 오류 없음.

- [ ] **Step 5: 커밋**

```bash
cd C:/StoryFit/apps/web
git add prisma/schema.prisma lib/import/types.ts
git commit -m "Feat: Melting용 meltingMeta/chapter/suggestRepliesEnabled 컬럼 + Captured.meltingMeta 타입

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: captureMelting이 meltingMeta 반환

**Files:**
- Modify: `lib/import/capture.ts` (`captureMelting`의 apiData 성공 반환부)

apiData(bot raw) 인터셉트에 성공한 경로에서만 `meltingMeta`를 함께 반환한다. OG 메타 폴백 경로는 그대로 둔다(meltingMeta 없음).

- [ ] **Step 1: apiData 성공 반환부에 meltingMeta 추가**

`lib/import/capture.ts`의 `captureMelting` 내부, apiData 기반 반환 블록을 찾아 수정한다. 현재:

```ts
      return {
        sections: [],
        title: assembledResult.title,
        imageUrl: apiData.profileImagePath
          ? `https://image-gen.melting.chat/public_images/${apiData.profileImagePath}?s=lg`
          : imageUrl,
        assembledResult,
      }
```

아래로 교체:

```ts
      return {
        sections: [],
        title: assembledResult.title,
        imageUrl: apiData.profileImagePath
          ? `https://image-gen.melting.chat/public_images/${apiData.profileImagePath}?s=lg`
          : imageUrl,
        assembledResult,
        meltingMeta: apiData,
      }
```

(여기서 `apiData`는 `captureMelting` 함수 스코프의 `apiData.bot`을 가리키는 지역 변수다 — 함수 본문에서 `const { sections, apiData } = await renderMeltingSections(url)`로 받은 그 `apiData`이며, 이미 bot raw 객체다. 변수명을 그대로 사용한다.)

- [ ] **Step 2: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
cd C:/StoryFit/apps/web
git add lib/import/capture.ts
git commit -m "Feat: captureMelting이 원본 bot 데이터를 meltingMeta로 반환

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: import route — isMelting 분기 + meltingMeta 저장

**Files:**
- Modify: `app/api/characters/import/route.ts` (`runImport`)

- [ ] **Step 1: isMelting / isImmersive 플래그 추가**

`runImport` 내 `const isZeta = matchesHost(url, 'zeta-ai.io')` 다음 줄을 수정한다. 현재:

```ts
  const isWhif = matchesHost(url, 'whif.io', 'whif.club')
  const isZeta = matchesHost(url, 'zeta-ai.io')
  const isImmersive = isWhif || isZeta
```

아래로 교체:

```ts
  const isWhif = matchesHost(url, 'whif.io', 'whif.club')
  const isZeta = matchesHost(url, 'zeta-ai.io')
  const isMelting = matchesHost(url, 'melting.chat')
  const isImmersive = isWhif || isZeta || isMelting
```

- [ ] **Step 2: collection 생성 시 meltingMeta 저장**

`prisma.characterCollection.create`의 `data`에서 `zetaMeta` 스프레드 줄 다음에 추가한다. 현재 (Zeta 작업에서 추가된 형태):

```ts
      ...(captured.zetaMeta ? { zetaMeta: captured.zetaMeta } : {}),
```

아래로 교체:

```ts
      ...(captured.zetaMeta ? { zetaMeta: captured.zetaMeta } : {}),
      ...(captured.meltingMeta ? { meltingMeta: captured.meltingMeta } : {}),
```

- [ ] **Step 3: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add app/api/characters/import/route.ts
git commit -m "Feat: import route에 Melting 분기 + meltingMeta 저장

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: POST /api/conversations가 suggestRepliesEnabled 수용

**Files:**
- Modify: `app/api/conversations/route.ts` (POST)

- [ ] **Step 1: create data에 suggestRepliesEnabled 추가**

`app/api/conversations/route.ts`의 POST 핸들러, `prisma.conversation.create`의 `data`에서 `styleConfig: body.styleConfig ?? null,` 줄 아래에 추가:

```ts
      styleConfig: body.styleConfig ?? null,
      suggestRepliesEnabled: body.suggestRepliesEnabled ?? false,
```

- [ ] **Step 2: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
cd C:/StoryFit/apps/web
git add app/api/conversations/route.ts
git commit -m "Feat: 대화 생성 API가 suggestRepliesEnabled 페이로드 수용

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: API 필터 — melting source 추가 + 일반목록서 melting 제외

**Files:**
- Modify: `app/api/characters/route.ts` (GET)
- Modify: `app/api/collections/route.ts` (GET)

- [ ] **Step 1: characters GET whereClause에 melting 추가**

`app/api/characters/route.ts`의 GET, 현재 `source` 분기(Zeta 작업에서 추가됨)를 아래로 교체한다:

```ts
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
            {
              creatorId: userId,
              OR: [
                { collectionId: null },
                {
                  collection: {
                    AND: [
                      { NOT: { sourceUrl: { contains: 'whif.' } } },
                      { NOT: { sourceUrl: { contains: 'zeta-ai.io' } } },
                      { NOT: { sourceUrl: { contains: 'melting.chat' } } },
                    ],
                  },
                },
              ],
            },
          ],
        }
```

- [ ] **Step 2: collections GET whereClause에 melting 추가**

`app/api/collections/route.ts`의 GET, 현재 `source` 분기(Zeta 작업에서 추가됨)를 아래로 교체한다:

```ts
  const source = searchParams.get('isWhif') === 'true' ? 'whif'
    : searchParams.get('isZeta') === 'true' ? 'zeta'
    : searchParams.get('isMelting') === 'true' ? 'melting'
    : 'regular'

  const whereClause: any = { userId }

  if (source === 'whif') {
    whereClause.sourceUrl = { contains: 'whif.' }
  } else if (source === 'zeta') {
    whereClause.sourceUrl = { contains: 'zeta-ai.io' }
  } else if (source === 'melting') {
    whereClause.sourceUrl = { contains: 'melting.chat' }
  } else {
    whereClause.AND = [
      { NOT: { sourceUrl: { contains: 'whif.' } } },
      { NOT: { sourceUrl: { contains: 'zeta-ai.io' } } },
      { NOT: { sourceUrl: { contains: 'melting.chat' } } },
    ]
  }
```

- [ ] **Step 3: collections 목록 GET select에 meltingMeta 추가**

`app/api/collections/route.ts`의 `findMany` `select`에서 `zetaMeta: true,` 줄 아래에 추가:

```ts
      zetaMeta: true,
      meltingMeta: true,
```

- [ ] **Step 4: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
cd C:/StoryFit/apps/web
git add app/api/characters/route.ts app/api/collections/route.ts
git commit -m "Feat: characters/collections API에 melting 필터 + 일반목록서 melting 분리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 추천답변 순수함수 (TDD)

**Files:**
- Create: `lib/suggestions.ts`
- Create: `lib/suggestions.test.ts`

순수함수 2개:
- `buildSuggestionPrompt(history, personaName)`: 시스템/유저 프롬프트 문자열 조립.
- `parseSuggestions(raw)`: AI 원본 응답에서 `{ "suggestions": [...] }` JSON을 추출·검증해 최대 3개 문자열 배열 반환. 파싱 실패 시 빈 배열.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/suggestions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSuggestionPrompt, parseSuggestions } from './suggestions'

describe('parseSuggestions', () => {
  it('정상 JSON에서 최대 3개 추출', () => {
    const raw = '```json\n{"suggestions":["*고개를 끄덕인다*","\\"그래서요?\\"","아무 말도 하지 않는다"]}\n```'
    expect(parseSuggestions(raw)).toEqual(['*고개를 끄덕인다*', '"그래서요?"', '아무 말도 하지 않는다'])
  })
  it('3개 초과면 3개로 절단', () => {
    const raw = '{"suggestions":["a","b","c","d","e"]}'
    expect(parseSuggestions(raw)).toEqual(['a', 'b', 'c'])
  })
  it('빈 문자열·공백 항목 제거', () => {
    const raw = '{"suggestions":["a","","  ","b"]}'
    expect(parseSuggestions(raw)).toEqual(['a', 'b'])
  })
  it('JSON 파싱 실패 시 빈 배열', () => {
    expect(parseSuggestions('완전 깨진 응답')).toEqual([])
  })
  it('suggestions 키 없으면 빈 배열', () => {
    expect(parseSuggestions('{"foo":1}')).toEqual([])
  })
})

describe('buildSuggestionPrompt', () => {
  const history = [
    { role: 'user', content: '안녕' },
    { role: 'assistant', content: '*그가 돌아본다* "왔어?"' },
  ]
  const { systemPrompt, userPrompt } = buildSuggestionPrompt(history, '지민')

  it('systemPrompt는 JSON 반환 지시 포함', () => {
    expect(systemPrompt).toContain('JSON')
  })
  it('userPrompt에 페르소나 이름 포함', () => {
    expect(userPrompt).toContain('지민')
  })
  it('userPrompt에 최근 대사 포함', () => {
    expect(userPrompt).toContain('왔어?')
  })
  it('userPrompt에 suggestions 형식 명시', () => {
    expect(userPrompt).toContain('suggestions')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd C:/StoryFit/apps/web && npx vitest run lib/suggestions.test.ts`
Expected: FAIL — `Failed to resolve import "./suggestions"`.

- [ ] **Step 3: `lib/suggestions.ts` 구현**

```ts
interface HistoryMsg { role: string; content: string }

export function buildSuggestionPrompt(
  history: HistoryMsg[],
  personaName: string,
): { systemPrompt: string; userPrompt: string } {
  const recent = history.slice(-8)
  const transcript = recent
    .map(m => `${m.role === 'user' ? (personaName || '나') : '상대'}: ${m.content}`)
    .join('\n')

  const systemPrompt = '당신은 롤플레이 대화에서 유저가 다음에 할 만한 발화를 제안하는 보조자입니다. JSON만 반환합니다.'

  const userPrompt = `아래 대화를 읽고, "${personaName || '나'}"(유저) 입장에서 다음에 할 만한 발화 3개를 제안하세요.

대화:
${transcript || '(아직 대화 없음 — 첫 발화 제안)'}

반환 형식 (JSON만, 설명 없이):
{ "suggestions": ["제안1", "제안2", "제안3"] }

규칙:
- 1인칭 유저 시점. 행동은 *별표*, 대사는 "큰따옴표"로 표기 가능.
- 각 제안은 1~2문장으로 짧게.
- 세 제안의 톤을 서로 다르게 (적극적 / 소극적 / 중립적).
- 상대(캐릭터)의 대사·행동을 대신 쓰지 말 것.`

  return { systemPrompt, userPrompt }
}

export function parseSuggestions(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.suggestions)) return []
    return parsed.suggestions
      .map((s: any) => String(s ?? '').trim())
      .filter((s: string) => s.length > 0)
      .slice(0, 3)
  } catch {
    return []
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd C:/StoryFit/apps/web && npx vitest run lib/suggestions.test.ts`
Expected: PASS — 모든 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
cd C:/StoryFit/apps/web
git add lib/suggestions.ts lib/suggestions.test.ts
git commit -m "Feat: 추천답변 프롬프트 조립·파싱 순수함수 + 테스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 추천답변 생성 엔드포인트

**Files:**
- Create: `app/api/conversations/[id]/suggestions/route.ts`

`POST`: 인증 + 소유권 확인 → 최근 메시지 조회 → `buildSuggestionPrompt` → `generateText` → `parseSuggestions` → `{ suggestions }` 반환.

- [ ] **Step 1: 엔드포인트 작성**

`app/api/conversations/[id]/suggestions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'
import { buildSuggestionPrompt, parseSuggestions } from '@/lib/suggestions'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, userId },
    include: {
      personaCharacter: { select: { name: true } },
      messages: { orderBy: { createdAt: 'asc' }, where: { isSelected: true }, select: { role: true, content: true } },
    },
  })
  if (!conv) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  const personaName = conv.personaCharacter?.name ?? '나'
  const history = conv.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }))

  const { systemPrompt, userPrompt } = buildSuggestionPrompt(history, personaName)
  const raw = await generateText(systemPrompt, userPrompt)
  const suggestions = parseSuggestions(raw)

  return NextResponse.json({ suggestions })
}
```

- [ ] **Step 2: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/api/conversations/[id]/suggestions/route.ts"
git commit -m "Feat: 추천답변 생성 엔드포인트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 장 카운터 — triggerStateTracking 확장

**Files:**
- Modify: `lib/storyEval.ts` (`triggerStateTracking`)

`triggerStateTracking`이 statusTimeline 갱신과 동시에, 장면이 근본적으로 전환되면 `chapter`를 1 증가시킨다. 호출 시그니처는 변경하지 않는다(내부에서 convId로 직접 update).

- [ ] **Step 1: 프롬프트 JSON에 newChapter 추가**

`lib/storyEval.ts`의 `triggerStateTracking` 내 `userPrompt`를 아래로 교체:

```ts
    const userPrompt = `아래 대화 교환을 읽고, 현재 씬의 물리적 상태를 JSON으로 반환하세요.

이전 상태:
${currentTimeline || '(없음)'}

유저 발화: ${userMsg.slice(0, 400)}
AI 응답: ${aiMsg.slice(0, 1000)}

반환 형식 (JSON만, 설명 없이):
{
  "statusTimeline": "현재 씬 상태를 불릿(•) 형식으로 3~5줄 요약. 반드시 포함: 시간대, 의상(누가 무엇을 입고 있는지), 장소, 현재 상황.",
  "newChapter": false
}

규칙:
- 이 대화에서 변화가 없으면 이전 상태를 그대로 유지
- 의상이 바뀌었으면 반드시 새 의상으로 업데이트
- 시간이 흘렀으면 반드시 새 시간대로 업데이트
- 장소가 바뀌었으면 반드시 새 장소로 업데이트
- newChapter: 장소·시간대가 근본적으로 전환(큰 시간 점프 또는 완전히 새로운 장소/상황으로 이동)됐을 때만 true, 아니면 false`
```

- [ ] **Step 2: 파싱부에서 chapter 증가 처리**

`triggerStateTracking`의 try 블록 내 statusTimeline 업데이트 부분을 아래로 교체:

```ts
    try {
      const raw = await generateText(systemPrompt, userPrompt)
      const parsed: any = JSON.parse(extractJson(raw))
      const data: any = {}
      if (typeof parsed.statusTimeline === 'string' && parsed.statusTimeline.trim()) {
        data.statusTimeline = parsed.statusTimeline.trim()
      }
      if (parsed.newChapter === true) {
        data.chapter = { increment: 1 }
      }
      if (Object.keys(data).length > 0) {
        await prisma.conversation.update({ where: { id: convId }, data })
      }
    } catch {
      // silent fail — 상태 추적 실패는 대화에 영향 없음
    }
```

- [ ] **Step 3: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add lib/storyEval.ts
git commit -m "Feat: 상태추적이 장면 전환 시 chapter 자동 증가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Melting 전용 CSS

**Files:**
- Modify: `app/globals.css` (파일 끝에 추가)

- [ ] **Step 1: `.melting-*` 블록 추가**

`app/globals.css` 맨 끝에 추가:

```css
/* ─── MELTING immersive (dark, hot-pink, scoped) ────────────────── */
.melting-root{
  --m-bg:#0d0d12; --m-surface:#1a1a22; --m-surface-2:#24242e; --m-line:#33333f;
  --m-ink:#f5f4f8; --m-ink-soft:#9b9aa8; --m-accent:#ff2e93; --m-radius:14px;
  display:flex; flex-direction:column; height:100%; min-height:0;
  background:var(--m-bg); color:var(--m-ink);
}
.melting-scroll{ flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch;
  padding-bottom:calc(16px + env(safe-area-inset-bottom)); }
.melting-header{ flex-shrink:0; display:flex; align-items:center; justify-content:space-between;
  padding:14px 16px; border-bottom:1px solid var(--m-line);
  background:linear-gradient(90deg,#ff2e93,#ff5fae); }
.melting-logo{ font-size:18px; font-weight:900; letter-spacing:.04em; color:#fff; }
.melting-iconbtn{ background:none; border:none; color:#fff; font-size:20px; cursor:pointer; padding:4px 8px; }
.melting-menu{ position:absolute; top:52px; right:12px; z-index:60; background:var(--m-surface-2);
  border:1px solid var(--m-line); border-radius:10px; overflow:hidden; min-width:220px; }
.melting-menu-item{ display:block; width:100%; text-align:left; background:none; border:none;
  color:var(--m-ink); font-size:13px; padding:11px 14px; cursor:pointer; }
.melting-menu-item:hover{ background:var(--m-surface); }
.melting-grid{ display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; padding:16px; }
.melting-card{ background:var(--m-surface); border:1px solid var(--m-line); border-radius:var(--m-radius);
  overflow:hidden; cursor:pointer; display:flex; flex-direction:column; position:relative; }
.melting-card-img{ width:100%; aspect-ratio:3/4; object-fit:cover; background:var(--m-surface-2); display:block; }
.melting-card-body{ padding:10px; display:flex; flex-direction:column; gap:6px; }
.melting-card-title{ font-size:13px; font-weight:800; color:var(--m-ink); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.melting-card-tags{ display:flex; flex-wrap:wrap; gap:4px; }
.melting-chip{ display:inline-block; background:var(--m-surface-2); color:var(--m-ink-soft);
  font-size:10px; padding:2px 8px; border-radius:999px; }
.melting-empty{ padding:48px 16px; text-align:center; color:var(--m-ink-soft); font-size:13px; line-height:1.7; }
.melting-cover{ width:100%; aspect-ratio:1; object-fit:cover; background:var(--m-surface-2); display:block; }
.melting-cover-wrap{ position:relative; }
.melting-back{ background:rgba(0,0,0,.4); border:none; color:#fff; font-size:20px; cursor:pointer;
  padding:2px 10px; border-radius:999px; }
.melting-section{ padding:16px; }
.melting-section-title{ font-size:15px; font-weight:800; color:var(--m-ink); margin:0 0 10px; }
.melting-avatar{ width:72px; height:72px; border-radius:14px; object-fit:cover; flex-shrink:0; }
.melting-desc{ color:var(--m-ink-soft); line-height:1.7; font-size:14px; white-space:pre-wrap; }
.melting-intro-box{ background:var(--m-surface); border:1px solid var(--m-line); border-radius:12px;
  padding:14px; color:var(--m-ink-soft); line-height:1.7; font-size:14px; }
.melting-cta{ position:sticky; bottom:0; padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  background:linear-gradient(180deg, transparent, var(--m-bg) 40%); }
.melting-cta-btn{ width:100%; padding:14px; border:none; border-radius:12px;
  background:linear-gradient(135deg,#ff2e93,#ff5fae); color:#fff; font-size:15px; font-weight:800; cursor:pointer; }
/* 추천답변 칩 · 장 뱃지 — 채팅방/대화목록(.melting-root 밖)에서도 쓰이므로 변수 폴백 명시 */
.melting-suggests{ display:flex; flex-direction:column; gap:6px; padding:8px 12px; }
.melting-suggest-row{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
.melting-suggest-chip{ flex:1; text-align:left; background:var(--m-surface-2,#24242e); border:1px solid var(--m-line,#33333f);
  color:var(--m-ink,#f5f4f8); font-size:13px; padding:9px 12px; border-radius:10px; cursor:pointer; }
.melting-suggest-chip:hover{ border-color:var(--m-accent,#ff2e93); }
.melting-suggest-regen{ background:none; border:1px solid var(--m-line,#33333f); color:var(--m-ink-soft,#9b9aa8);
  font-size:12px; padding:7px 10px; border-radius:10px; cursor:pointer; white-space:nowrap; }
.melting-chapter-badge{ display:inline-flex; align-items:center; gap:3px; background:var(--m-accent,#ff2e93);
  color:#fff; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px; }
```

- [ ] **Step 2: 커밋**

```bash
cd C:/StoryFit/apps/web
git add app/globals.css
git commit -m "Style: Melting 센터 전용 .melting-* 클래스 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Melting 레이아웃 + 목록 페이지

**Files:**
- Create: `app/(melting)/layout.tsx`
- Create: `app/(melting)/melting/page.tsx`

- [ ] **Step 1: 레이아웃 작성**

`app/(melting)/layout.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppProvider } from '@/providers/AppProvider'
import { getAccessToken } from '@/lib/authClient'

export default function MeltingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => { if (!getAccessToken()) router.replace('/login') }, [])
  return (
    <AppProvider>
      <div className="melting-root">{children}</div>
    </AppProvider>
  )
}
```

- [ ] **Step 2: 목록 페이지 작성**

`app/(melting)/melting/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface MChar {
  id: string; title: string; coverImageUrl: string; tags: string[]
  characters: { id: string; name: string; avatarUrl: string | null }[]
}

export default function MeltingListPage() {
  const router = useRouter()
  const [chars, setChars] = useState<MChar[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setEditMode(localStorage.getItem('melting_edit') === '1')
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try { setChars(await api.get('/api/collections?isMelting=true')) }
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
    localStorage.setItem('melting_edit', next ? '1' : '0'); setMenuOpen(false)
  }

  const deleteChar = async (id: string) => {
    if (!confirm('이 캐릭터를 삭제할까요?')) return
    await api.delete(`/api/collections/${id}`); await fetchData()
  }

  return (
    <>
      <div className="melting-header" style={{ position: 'relative' }}>
        <div className="melting-logo">melting</div>
        <button className="melting-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
        {menuOpen && (
          <div className="melting-menu">
            <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input className="field" placeholder="https://melting.chat/..." value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
                style={{ fontSize: 12 }} />
              <button className="melting-menu-item"
                style={{ background: 'var(--m-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
                disabled={importing} onClick={handleImport}>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
            </div>
            <button className="melting-menu-item" onClick={toggleEditMode}>
              {editMode ? '✓ 편집 모드 끄기' : '✏ 편집 모드 켜기'}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✓') ? '#4ade80' : '#ff6b8a' }}>{msg}</div>}

      <div className="melting-scroll">
        {loading ? (
          <div className="melting-empty">불러오는 중...</div>
        ) : chars.length === 0 ? (
          <div className="melting-empty">가져온 캐릭터가 없습니다<br />⋮ 메뉴에서 melting.chat 캐릭터 URL로 가져오세요.</div>
        ) : (
          <div className="melting-grid">
            {chars.map(c => {
              const thumb = c.coverImageUrl || c.characters[0]?.avatarUrl || ''
              return (
                <div key={c.id} className="melting-card"
                  onClick={() => !editMode && router.push(`/melting/characters/${c.id}`)}>
                  {thumb ? <img className="melting-card-img" src={thumb} alt="" /> : <div className="melting-card-img" />}
                  <div className="melting-card-body">
                    <div className="melting-card-title">{c.title}</div>
                    {c.tags?.length > 0 && (
                      <div className="melting-card-tags">
                        {c.tags.slice(0, 3).map(t => <span key={t} className="melting-chip">#{t}</span>)}
                      </div>
                    )}
                  </div>
                  {editMode && (
                    <button onClick={e => { e.stopPropagation(); deleteChar(c.id) }}
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

- [ ] **Step 3: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/(melting)/layout.tsx" "app/(melting)/melting/page.tsx"
git commit -m "Feat: Melting 센터 레이아웃 + 캐릭터 목록 페이지

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Melting 캐릭터 상세 페이지 + 대화 생성

**Files:**
- Create: `app/(melting)/melting/characters/[id]/page.tsx`

상세에서 "대화 시작하기" → 페르소나 모달 → `POST /api/conversations`로 **Melting 설정 포함** 새 대화 생성 → 채팅방 이동.

- [ ] **Step 1: 상세 페이지 작성**

`app/(melting)/melting/characters/[id]/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import WhifPersonaModal, { type NewPersonaData } from '@/components/ui/WhifPersonaModal'
import NovelText from '@/components/ui/NovelText'

interface Char {
  id: string; name: string; avatarUrl: string | null; additionalInfo: string
  openingMessage: string; tags: string[]
}
interface Collection {
  id: string; title: string; coverImageUrl: string; description: string; tags: string[]
  characters: Char[]; meltingMeta?: any
}

export default function MeltingCharDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(setCol).catch(() => setCol(null))
  }, [id])

  if (!col) return <div className="melting-empty">불러오는 중...</div>

  const meta = col.meltingMeta ?? {}
  const mainChar = col.characters[0]
  const tagline = meta.publicTagline ?? col.description ?? ''
  const opening = mainChar?.openingMessage ?? ''

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
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'roleplay',
        personaCharacterId: personaId,
        statsEnabled: true,
        statsConfig: [{ name: '호감도', value: 50, min: 0, max: 100 }],
        suggestRepliesEnabled: true,
        ...(opening.trim() ? { openingMessage: opening } : {}),
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
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newPersona) => handlePersonaSelect(charId, newPersona)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="melting-scroll">
          <div className="melting-cover-wrap">
            {col.coverImageUrl ? <img className="melting-cover" src={col.coverImageUrl} alt="" /> : <div className="melting-cover" />}
            <button className="melting-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
          </div>

          <div className="melting-section">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {mainChar?.avatarUrl
                ? <img className="melting-avatar" src={mainChar.avatarUrl} alt="" />
                : <div className="melting-avatar" style={{ background: 'var(--m-line)' }} />}
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--m-ink)' }}>{col.title}</h1>
                {meta.nsfw && <span className="melting-chip" style={{ background: 'var(--m-accent)', color: '#fff' }}>NSFW</span>}
              </div>
            </div>
            {tagline && <p className="melting-desc" style={{ marginBottom: 10 }}>{tagline}</p>}
            {col.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.tags.map(t => <span key={t} className="melting-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {mainChar?.additionalInfo?.trim() && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">상세 설정</h2>
              <p className="melting-desc">{mainChar.additionalInfo}</p>
            </div>
          )}

          {opening.trim() && (
            <div className="melting-section" style={{ paddingTop: 0 }}>
              <h2 className="melting-section-title">첫 장면</h2>
              <div className="melting-intro-box">
                <NovelText text={opening
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
              </div>
            </div>
          )}

          {error && <div style={{ padding: '8px 16px', color: '#ff6b8a', fontSize: 12 }}>{error}</div>}
        </div>

        <div className="melting-cta">
          <button className="melting-cta-btn" onClick={() => setPersonaOpen(true)} disabled={!mainChar}>대화 시작하기</button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/(melting)/melting/characters/[id]/page.tsx"
git commit -m "Feat: Melting 캐릭터 상세 페이지 + 호감도/추천답변 대화 생성

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: 채팅방 추천답변 UI

**Files:**
- Modify: `app/(main)/conversations/[id]/page.tsx`

`conv.suggestRepliesEnabled === true`이고 마지막 메시지가 assistant일 때, composer 위에 추천답변 칩 3개 + "🔄 새로 생성"을 표시. 칩 탭 → `fillComposer`. 마지막 응답 수신 후/진입 시 자동 1회 로드.

- [ ] **Step 1: Conv 인터페이스에 suggestRepliesEnabled / chapter 추가**

`app/(main)/conversations/[id]/page.tsx`의 `interface Conv`에 필드 추가 (기존 마지막 필드 `messages: Msg[]` 위):

```ts
  styleConfig?: Record<string, string | null> | null
  sourceLorebookUrls?: { url: string; name: string }[] | null
  suggestRepliesEnabled?: boolean
  chapter?: number
  characters: ConvChar[]
```

- [ ] **Step 2: 추천답변 state + 로더 추가**

`const [conv, setConv] = useState<Conv | null>(null)` 아래에 추가:

```ts
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)

  const loadSuggestions = async () => {
    if (suggestLoading) return
    setSuggestLoading(true)
    try {
      const r = await api.post(`/api/conversations/${params.id}/suggestions`, {})
      setSuggestions(Array.isArray(r.suggestions) ? r.suggestions : [])
    } catch { setSuggestions([]) }
    finally { setSuggestLoading(false) }
  }
```

- [ ] **Step 3: 응답 완료/진입 시 자동 로드**

`messages` 상태가 갱신되고 typing이 끝났을 때 자동 로드하는 effect를 추가한다. `useEffect`들이 모인 영역(예: `params.id` effect 근처)에 추가:

```ts
  useEffect(() => {
    if (!conv?.suggestRepliesEnabled) return
    if (typing) return
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') loadSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.suggestRepliesEnabled, typing, messages.length])
```

- [ ] **Step 4: composer 위에 추천답변 UI 렌더**

채팅 입력창(`<textarea ... composerRef>`이 있는 composer 컨테이너) 바로 위에, 아래 블록을 추가한다. 조건: `conv.suggestRepliesEnabled`이고 마지막 메시지가 assistant이며 typing 중이 아닐 때.

```tsx
{conv?.suggestRepliesEnabled && !typing && messages[messages.length - 1]?.role === 'assistant' && (
  <div className="melting-suggests">
    {suggestLoading && suggestions.length === 0 ? (
      <div style={{ fontSize: 12, color: 'var(--m-ink-soft, #9b9aa8)', padding: '4px 2px' }}>추천 답변 생성 중…</div>
    ) : suggestions.length > 0 ? (
      <>
        {suggestions.map((s, i) => (
          <div className="melting-suggest-row" key={i}>
            <button className="melting-suggest-chip" onClick={() => fillComposer(s)}>{s}</button>
          </div>
        ))}
        <button className="melting-suggest-regen" disabled={suggestLoading} onClick={loadSuggestions}>
          {suggestLoading ? '…' : '🔄 새로 생성'}
        </button>
      </>
    ) : null}
  </div>
)}
```

- [ ] **Step 5: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/(main)/conversations/[id]/page.tsx"
git commit -m "Feat: 채팅방 추천답변 칩 UI (melting 게이트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: 장 뱃지 — 채팅방 헤더 + 대화목록

**Files:**
- Modify: `app/(main)/conversations/[id]/page.tsx` (헤더 뱃지)
- Modify: `app/(main)/chatlist/page.tsx` (목록 뱃지)

`suggestRepliesEnabled`(=Melting 대화)일 때 "N장" 뱃지를 표시한다.

- [ ] **Step 1: 채팅방 헤더에 장 뱃지 추가**

`app/(main)/conversations/[id]/page.tsx`의 헤더 영역에서 캐릭터 이름이 표시되는 곳 근처에, 아래를 추가한다(타이틀 옆):

```tsx
{conv?.suggestRepliesEnabled && (conv.chapter ?? 1) > 0 && (
  <span className="melting-chapter-badge" style={{ marginLeft: 6 }}>{conv.chapter ?? 1}장</span>
)}
```

- [ ] **Step 2: 대화목록 ConvItem에 필드 추가**

`app/(main)/chatlist/page.tsx`의 `interface ConvItem`에 추가:

```ts
  personaCharacter?: { name: string } | null
  suggestRepliesEnabled?: boolean
  chapter?: number
```

- [ ] **Step 3: 대화목록 카드에 장 뱃지 추가**

`app/(main)/chatlist/page.tsx`의 mode-badge가 렌더되는 줄(`<span className="mode-badge" ...>{MODE_LABEL[conv.mode] ...}</span>`) 다음에 추가:

```tsx
{conv.suggestRepliesEnabled && (
  <span className="melting-chapter-badge" style={{ fontSize: 8, marginLeft: 4 }}>{conv.chapter ?? 1}장</span>
)}
```

- [ ] **Step 4: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/(main)/conversations/[id]/page.tsx" "app/(main)/chatlist/page.tsx"
git commit -m "Feat: Melting 대화에 N장 뱃지 (채팅방 헤더 + 대화목록)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: 홈 진입 버튼

**Files:**
- Modify: `app/(main)/page.tsx`

- [ ] **Step 1: 메뉴 배열에 MELTING 센터 추가**

`app/(main)/page.tsx`의 아이콘 배열에서 `{ label: 'ZETA 센터', emoji: '⚡', href: '/zeta' },` 줄 아래에 추가:

```ts
  { label: 'ZETA 센터', emoji: '⚡', href: '/zeta' },
  { label: 'MELTING 센터', emoji: '🔥', href: '/melting' },
```

- [ ] **Step 2: 가져오기 안내 Melting 항목에 href 추가**

`app/(main)/page.tsx`에서 Melting 안내 항목(`label: 'Melting (melting.chat)'`)에 `href: '/melting'`를 추가:

```ts
      { emoji: '🔥', label: 'Melting (melting.chat)', desc: '캐릭터 페이지 URL로 대화 상대를 바로 불러올 수 있습니다.', href: '/melting' },
```

- [ ] **Step 3: 빌드(타입) 확인**

Run: `cd C:/StoryFit/apps/web && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
cd C:/StoryFit/apps/web
git add "app/(main)/page.tsx"
git commit -m "Feat: 홈에 MELTING 센터 진입 버튼 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: 전체 빌드 + 배포

**Files:** 없음 (검증 + 배포)

- [ ] **Step 1: 단위 테스트 전체 실행**

Run: `cd C:/StoryFit/apps/web && npm run test`
Expected: `lib/suggestions.test.ts` 포함 전부 PASS.

- [ ] **Step 2: 프로덕션 빌드**

Run: `cd C:/StoryFit/apps/web && npm run build`
Expected: 빌드 성공, 타입 오류 없음. `/melting`, `/melting/characters/[id]` 라우트 생성 확인.

- [ ] **Step 3: 서브모듈(main) 푸시**

```bash
cd C:/StoryFit/apps/web
git push origin main
```

- [ ] **Step 4: 부모 레포(master) 서브모듈 포인터 업데이트**

```bash
cd C:/StoryFit
git add apps/web
git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (Melting 센터)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin master
```

- [ ] **Step 5: 수동 검증 (서버 빌드 후)**

서버에서 `git pull origin master && git submodule update --remote apps/web && docker compose up --build -d` (meltingMeta/chapter/suggestRepliesEnabled 컬럼은 `db push`로 자동 반영).
브라우저에서:
1. 홈 → "MELTING 센터" 진입.
2. ⋮ → melting.chat 캐릭터 URL 가져오기 → 카드 표시 확인.
3. 카드 클릭 → 상세(커버/아바타/태그/상세설정/첫장면) 확인.
4. "대화 시작하기" → 페르소나 모달 → 채팅방 진입, 첫 메시지 표시 확인.
5. 채팅 진행 → 추천답변 칩 3개 노출, 탭 시 입력창에 채워지는지 확인, "🔄 새로 생성" 동작 확인.
6. `!호감도` 입력 → 호감도 스탯 표시 확인. 대화 진행 시 호감도 값 변동 확인.
7. 장면 전환되는 대화 후 "N장" 뱃지 증가 확인(헤더 + 대화목록).

---

## 보류 / 범위 밖

- 제작자 authored "장" 콘텐츠 import — 공개 데이터에 없음. chapter는 카운터 근사로만 동작.
- Melting 홈의 "인기/새로 추가" 캐러셀 섹션 분리 — 가져온 캐릭터 수가 적어 단일 그리드로 대체.
- 추천답변/장 카운터의 AI 호출 부분 단위 테스트 — 순수함수(`buildSuggestionPrompt`/`parseSuggestions`)만 테스트.
