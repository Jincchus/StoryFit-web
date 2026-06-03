# 핵심메모리 승격 — 영구표시 + 다중선택 AI요약 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장기메모리 항목을 핵심메모리로 "올린" 사실을 DB 플래그로 영구 기록해 배지가 사라지지 않게 하고, 다중선택 시 AI로 압축 요약해 올린다.

**Architecture:** `Memory.promoted` Boolean 추가. 승격은 신규 `POST .../memories/promote` 라우트가 처리 — 단독은 요약 그대로, 다중은 `condenseForCoreMemory`(Gemini)로 압축한 뒤 핵심메모리에 이어붙이고 `coreMemory`+`promoted`를 한 트랜잭션으로 즉시 저장(디바운스 revert 제거). 클라이언트 배지는 문자열 매칭 대신 `mem.promoted`를 따른다.

**Tech Stack:** Next.js 14 (App Router), Prisma (`db push` 방식, migrations 폴더 없음), Gemini(`@/lib/ai/gemini` `generateText`). **이 저장소엔 테스트 러너가 없으므로** 검증은 `npx tsc --noEmit` 타입체크 + `npm run build` + 수동 확인으로 한다.

---

## 사전 메모

- 스키마 변경 반영은 `npm run db:push` + `npm run db:generate` (이 repo는 `prisma migrate` 미사용 — `embedding`이 `Unsupported("vector(768)")`라 migrate가 까다로움).
- 캐릭터 컨텍스트는 기존 요약과 동일하게 `[firstChar.tags?.join(', '), firstChar.additionalInfo]`로 만든다 (Character엔 `systemPrompt` 필드가 없음). 첫 캐릭터는 `conv.characters[0]?.character` (관계 `characters: { include: { character: true }, orderBy: { turnOrder: 'asc' } }`).
- `api.post(path, body)`는 응답 JSON을 파싱해 반환한다 (`lib/api.ts`).

## 파일 구조

- `prisma/schema.prisma` — `Memory.promoted Boolean @default(false)` 추가
- `lib/memorySummarization.ts` — `buildCoreMemoryPrompt`(순수) + `condenseForCoreMemory`(generateText) 추가
- `app/api/conversations/[id]/memories/promote/route.ts` — 신규 POST 핸들러
- `app/(main)/conversations/[id]/_hooks/useMemoryPanel.ts` — promote가 API 호출, `promoted` 플래그·`promoting` 로딩 관리, 시그니처 변경
- `app/(main)/conversations/[id]/page.tsx` — `applyServerCoreMemory` 추가, 훅 호출 변경, `isPromoted` 플래그 기반, 로딩 UI

---

### Task 1: 스키마 — `Memory.promoted` 추가

**Files:**
- Modify: `prisma/schema.prisma` (model `Memory`)

- [ ] **Step 1: 필드 추가** — `model Memory`의 `createdAt` 아래(인덱스 위)에 추가

기존:
```prisma
  embedding          Unsupported("vector(768)")?
  createdAt          DateTime     @default(now())

  @@index([conversationId, createdAt])
```
변경:
```prisma
  embedding          Unsupported("vector(768)")?
  createdAt          DateTime     @default(now())
  promoted           Boolean      @default(false)

  @@index([conversationId, createdAt])
```

- [ ] **Step 2: DB 반영 + 클라이언트 생성**

Run: `cd /home/server/StoryFit/apps/web && npm run db:push && npm run db:generate`
Expected: db push 성공("Your database is now in sync"), Prisma Client 재생성 성공. 기존 행은 `promoted=false`.

- [ ] **Step 3: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add prisma/schema.prisma
git commit -m "feat(memory): add Memory.promoted flag"
```

---

### Task 2: AI 압축 요약 헬퍼

**Files:**
- Modify: `lib/memorySummarization.ts`

- [ ] **Step 1: 순수 프롬프트 빌더 + 압축 함수 추가** — 파일 끝에 추가

```ts
// 다중선택 승격 시: 선택 요약들을 '핵심 기억'으로 압축하는 user 프롬프트
export function buildCoreMemoryPrompt(summaries: string[], existingCoreMemory: string): string {
  return `아래 대화 요약들을 '핵심 기억'으로 정리하세요.

[지속 상태] — 지금도 유효한 것만, 사건 나열 없이:
1. 인물 간 관계의 현재 상태와 변화 (예: 적대→신뢰, 연인이 됨, 비밀 공유)
2. 누적된 감정의 결과 — 지금 서로에게 갖는 감정
3. 절대 잊으면 안 되는 확정 사실 — 정체·비밀·약속·중요 설정/소지품
4. 현재까지 확정된 외형·신체·능력 변화
5. 현재 위치·상황 — 지금 어디서 무엇을 하는 중인지 + 그렇게 된 직접적 이유 (과정 나열 X, '현재 상태와 계기'만)
6. 미해결 과제·현재 목표·예고된 위협 — 아직 끝나지 않은 일, 하려던 것, 다가오는 위험

규칙:
- 모든 항목: 중복 제거, 추측 금지(요약에 명시된 것만), 각 항목 "•", 한국어.
- 사실이 서로 모순되면 최신 정보를 우선한다.
- 아래 '이미 적힌 핵심메모리'에 있는 내용은 반복하지 말 것:
${existingCoreMemory.trim() || '(없음)'}

대화 요약들:
${summaries.join('\n\n')}`
}

export async function condenseForCoreMemory(
  summaries: string[],
  existingCoreMemory: string,
  characterContext: string,
): Promise<string> {
  const systemPrompt = `당신은 롤플레이 대화의 '핵심 기억' 정리 전문가입니다.
핵심 기억은 AI가 대화 내내 절대 잊으면 안 되는 '지속 사실·관계 상태'와 '현재 상황·미해결 줄거리'입니다.
캐릭터 설정: ${characterContext}`
  return generateText(systemPrompt, buildCoreMemoryPrompt(summaries, existingCoreMemory))
}
```

(`generateText`는 파일 상단에서 이미 import됨: `import { generateText } from '@/lib/ai/gemini'`.)

- [ ] **Step 2: 타입체크**

Run: `cd /home/server/StoryFit/apps/web && npx tsc --noEmit 2>&1 | grep memorySummarization || echo OK`
Expected: `OK` (memorySummarization 관련 에러 없음).

- [ ] **Step 3: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/memorySummarization.ts
git commit -m "feat(memory): add condenseForCoreMemory for multi-select promote"
```

---

### Task 3: 승격 API 라우트

**Files:**
- Create: `app/api/conversations/[id]/memories/promote/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth'
import { condenseForCoreMemory } from '@/lib/memorySummarization'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const conv = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: {
      userId: true,
      coreMemory: true,
      characters: {
        include: { character: { select: { tags: true, additionalInfo: true } } },
        orderBy: { turnOrder: 'asc' },
      },
    },
  })
  if (!conv || conv.userId !== userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { memoryIds } = await req.json()
  if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
    return NextResponse.json({ error: 'memoryIds가 필요합니다.' }, { status: 400 })
  }

  const memories = await prisma.memory.findMany({
    where: { id: { in: memoryIds }, conversationId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  if (memories.length === 0) {
    return NextResponse.json({ error: '메모리를 찾을 수 없습니다.' }, { status: 404 })
  }

  const firstChar = conv.characters[0]?.character
  const characterContext = firstChar
    ? [firstChar.tags?.join(', '), firstChar.additionalInfo].filter(Boolean).join('\n')
    : ''

  const condensed = memories.length === 1
    ? memories[0].summary
    : await condenseForCoreMemory(memories.map(m => m.summary), conv.coreMemory, characterContext)

  const existing = conv.coreMemory.trim()
  const newCoreMemory = existing ? existing + '\n\n' + condensed : condensed
  const promotedIds = memories.map(m => m.id)

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: params.id },
      data: { coreMemory: newCoreMemory },
    }),
    prisma.memory.updateMany({
      where: { id: { in: promotedIds }, conversationId: params.id },
      data: { promoted: true },
    }),
  ])

  return NextResponse.json({ coreMemory: newCoreMemory, promotedIds })
}
```

- [ ] **Step 2: 타입체크**

Run: `cd /home/server/StoryFit/apps/web && npx tsc --noEmit 2>&1 | grep 'memories/promote' || echo OK`
Expected: `OK`. (`Character.tags`/`additionalInfo`, `Memory.promoted`가 Task 1·생성된 클라이언트에 존재해야 함 — 에러 시 `npm run db:generate` 재실행.)

- [ ] **Step 3: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add 'app/api/conversations/[id]/memories/promote/route.ts'
git commit -m "feat(memory): add promote endpoint (single passthrough / multi AI-condense)"
```

---

### Task 4: 클라이언트 훅 — API 호출 + 플래그/로딩

**Files:**
- Modify (전면 재작성): `app/(main)/conversations/[id]/_hooks/useMemoryPanel.ts`

- [ ] **Step 1: 파일 전체 교체**

```ts
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface MemoryEntry { id: string; summary: string; createdAt: string; promoted: boolean }

export function useMemoryPanel(
  convId: string,
  setToast: (msg: string) => void,
  applyCoreMemory: (value: string) => void,
) {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<Set<string>>(new Set())
  const [expandedPromotedIds, setExpandedPromotedIds] = useState<Set<string>>(new Set())
  const [memoryError, setMemoryError] = useState(false)
  const [promoting, setPromoting] = useState(false)

  useEffect(() => {
    api.get(`/api/conversations/${convId}/memories`).then(setMemories).catch(() => setMemoryError(true))
  }, [convId])

  const handleDeleteMemory = async (memoryId: string) => {
    try {
      await api.delete(`/api/conversations/${convId}/memories`, { memoryId })
      setMemories(prev => prev.filter(m => m.id !== memoryId))
    } catch { setToast('메모리 삭제에 실패했습니다') }
  }

  const handlePromoteMemories = async () => {
    const ids = [...selectedMemoryIds]
    if (!ids.length || promoting) return
    setPromoting(true)
    try {
      const res = await api.post(`/api/conversations/${convId}/memories/promote`, { memoryIds: ids })
      applyCoreMemory(res.coreMemory)
      setMemories(prev => prev.map(m => ids.includes(m.id) ? { ...m, promoted: true } : m))
      setSelectedMemoryIds(new Set())
      setToast('핵심 메모리에 추가됐습니다')
    } catch {
      setToast('핵심 메모리 추가에 실패했습니다')
    } finally {
      setPromoting(false)
    }
  }

  const toggleMemorySelect = (id: string) => {
    setSelectedMemoryIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleExpandPromoted = (id: string) => {
    setExpandedPromotedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return {
    memories, memoryError, promoting,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories,
    toggleMemorySelect, toggleExpandPromoted,
  }
}
```

- [ ] **Step 2: 타입체크** (page.tsx는 Task 5에서 맞춤 — 여기선 훅 자체 에러만 확인)

Run: `cd /home/server/StoryFit/apps/web && npx tsc --noEmit 2>&1 | grep 'useMemoryPanel.ts' || echo OK`
Expected: `OK` (useMemoryPanel.ts 자체 에러 없음. page.tsx의 인자/`promoting` 관련 에러는 Task 5에서 해소).

- [ ] **Step 3: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add 'app/(main)/conversations/[id]/_hooks/useMemoryPanel.ts'
git commit -m "feat(memory): promote via API with persistent flag + loading state"
```

---

### Task 5: page.tsx 배선 — 플래그 배지 + 로딩 UI

**Files:**
- Modify: `app/(main)/conversations/[id]/page.tsx`

- [ ] **Step 1: 서버 반영용 setter 추가** — `handleCoreMemory` 정의(현재 507~510줄) 바로 아래에 추가

기존:
```ts
  const handleCoreMemory = (value: string) => {
    setConv(c => c ? { ...c, coreMemory: value } : c)
    debouncedPatch('coreMemory', value)
  }
```
바로 아래 추가:
```ts
  // 승격 API가 이미 서버에 저장한 값 → 로컬 state만 갱신(디바운스 patch 안 함)
  const applyServerCoreMemory = (value: string) => {
    setConv(c => c ? { ...c, coreMemory: value } : c)
  }
```

- [ ] **Step 2: 훅 호출 변경** — 현재 512~518줄

기존:
```ts
  const {
    memories, memoryError,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories,
    toggleMemorySelect, toggleExpandPromoted,
  } = useMemoryPanel(params.id, setToast, handleCoreMemory, conv?.coreMemory ?? '')
```
변경:
```ts
  const {
    memories, memoryError, promoting,
    selectedMemoryIds, expandedPromotedIds,
    handleDeleteMemory, handlePromoteMemories,
    toggleMemorySelect, toggleExpandPromoted,
  } = useMemoryPanel(params.id, setToast, applyServerCoreMemory)
```

- [ ] **Step 3: 배지 판정을 플래그로 변경** — 현재 1331줄

기존:
```ts
                    const isPromoted = !!conv?.coreMemory && conv.coreMemory.includes(mem.summary)
```
변경:
```ts
                    const isPromoted = mem.promoted
```

- [ ] **Step 4: 승격 버튼 로딩 표시** — 현재 1316~1322줄

기존:
```tsx
                {selectedMemoryIds.size > 0 && (
                  <button
                    className="btn primary"
                    style={{ fontSize: 10, padding: '3px 8px', width: '100%', marginBottom: 6 }}
                    onClick={handlePromoteMemories}
                  >↑ 선택한 항목 핵심 메모리로 올리기 ({selectedMemoryIds.size})</button>
                )}
```
변경:
```tsx
                {selectedMemoryIds.size > 0 && (
                  <button
                    className="btn primary"
                    style={{ fontSize: 10, padding: '3px 8px', width: '100%', marginBottom: 6 }}
                    disabled={promoting}
                    onClick={handlePromoteMemories}
                  >{promoting
                    ? (selectedMemoryIds.size > 1 ? '요약해서 올리는 중...' : '올리는 중...')
                    : `↑ 선택한 항목 핵심 메모리로 올리기 (${selectedMemoryIds.size})`}</button>
                )}
```

- [ ] **Step 5: 타입체크 (전체)**

Run: `cd /home/server/StoryFit/apps/web && npx tsc --noEmit 2>&1 | tail -20`
Expected: 출력 없음(에러 없음). 특히 `page.tsx`/`useMemoryPanel.ts` 관련 에러 0.

- [ ] **Step 6: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add 'app/(main)/conversations/[id]/page.tsx'
git commit -m "feat(memory): flag-based promoted badge + promote loading UI"
```

---

### Task 6: 최종 검증 + 배포

**Files:** 없음 (검증·배포)

- [ ] **Step 1: 빌드**

Run: `cd /home/server/StoryFit/apps/web && npm run build 2>&1 | tail -25`
Expected: 빌드 성공(`Compiled successfully`), 타입/린트 에러 없음.

- [ ] **Step 2: 수동 확인** (`npm run dev`, 로그인 후 대화 진입 → 우측 "🧠 장기 메모리")
  - 요약 1개 체크 → "올리기" → 핵심메모리에 그대로 추가 + 그 항목 "↑ 핵심" 배지.
  - 요약 2개+ 체크 → "올리기" → "요약해서 올리는 중..." 표시 후 핵심메모리에 **압축 요약** 추가 + 항목들 배지.
  - 핵심메모리 textarea의 글자를 **수정** → 배지 **유지**되는지(사라지지 않는지) 확인. ← 핵심 회귀 검증.
  - 새로고침(F5) 후에도 배지 유지(서버 `promoted` 반영) 확인.

- [ ] **Step 3: 배포 (CLAUDE.md 2단계)**

```bash
# 1) 서브모듈(main)
cd /home/server/StoryFit/apps/web
git push origin main
# 2) 부모 레포(master) — 서브모듈 포인터 갱신
cd /home/server/StoryFit
git add apps/web
git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (핵심메모리 승격 영구표시 + 다중 AI요약)"
git push origin master
```
서버 반영: `git pull origin master && git submodule update --remote apps/web && docker compose up --build -d`.
**주의:** 서버 DB에도 스키마 변경 적용 필요 — 서버에서 `npm run db:push`(또는 컨테이너 빌드시 동등 처리) 1회 실행해 `Memory.promoted` 컬럼 반영.

이 단계는 별도 커밋 없음(배포 전용).

---

## Self-Review (spec 대비)

- **데이터 모델(spec §3)** → Task 1 ✓
- **승격 엔드포인트, 단독/다중 분기, 트랜잭션 즉시저장(§4)** → Task 3 ✓
- **클라이언트 플래그 배지·로딩·즉시반영(§5)** → Task 4·5 ✓
- **AI 6카테고리 프롬프트 + 최신우선 + 기존 중복방지(§6)** → Task 2 ✓
- **테스트(§7)** → repo에 테스트 러너 없음 → tsc/build/수동 검증으로 대체(상단 명시) ✓
- **배포 2단계 + db 반영(§8)** → Task 6 ✓
- 타입 일관성: `condenseForCoreMemory(summaries, existingCoreMemory, characterContext)` 시그니처가 Task 2 정의와 Task 3 호출에서 일치. `promoted`/`promoting` 명칭이 Task 1·4·5에서 일치 ✓
- 플레이스홀더: 없음 ✓
