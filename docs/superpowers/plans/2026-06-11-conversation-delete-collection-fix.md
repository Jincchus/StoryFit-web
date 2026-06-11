# 대화 삭제 시 캐릭터카드 삭제 방지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같은 sourceUrl을 공유하는 다른 대화방이 남아있을 때, 대화방 삭제로 인해 그 sourceUrl에 연결된 `CharacterCollection`(센터 카드)이 함께 삭제되지 않도록 한다.

**Architecture:** `app/api/conversations/[id]/route.ts`의 DELETE 핸들러에서 sourceUrl 기반 fallback 컬렉션 삭제 전에, 같은 사용자의 같은 baseSourceUrl을 가진 다른 대화(`id !== params.id`)가 존재하는지 조회하고, 존재하면 fallback 삭제 조건에서 제외한다.

**Tech Stack:** TypeScript, Prisma

---

## 참고: 스펙

`apps/web/docs/superpowers/specs/2026-06-11-conversation-delete-collection-fix-design.md`

## 참고: 현재 코드

`apps/web/app/api/conversations/[id]/route.ts:88-109`:
```ts
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const target = await prisma.conversation.findFirst({
    where: { id: params.id, userId },
    select: { id: true, rootConversationId: true, isArchived: true, isPinned: true, sourceUrl: true },
  })
  if (!target) return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 })

  // URL import로 연결된 컬렉션 제거 (캐릭터는 보존, collectionId만 null로)
  // conversationId 직접 매핑 우선, 없으면 sourceUrl path 기반 폴백 (share_id 변형 대비)
  const baseSourceUrl = target.sourceUrl ? target.sourceUrl.split('?')[0] : ''
  await prisma.characterCollection.deleteMany({
    where: {
      userId,
      OR: [
        { conversationId: params.id },
        ...(baseSourceUrl ? [{ sourceUrl: { startsWith: baseSourceUrl }, conversationId: null }] : []),
      ],
    },
  })
```

---

## Task 1: DELETE 핸들러에 sibling 대화 확인 로직 추가

**Files:**
- Modify: `apps/web/app/api/conversations/[id]/route.ts:98-109`

- [ ] **Step 1: sibling 조회 + 조건 분기 추가**

`apps/web/app/api/conversations/[id]/route.ts:98-109`를 다음으로 교체한다:

```ts
  // URL import로 연결된 컬렉션 제거 (캐릭터는 보존, collectionId만 null로)
  // conversationId 직접 매핑 우선, 없으면 sourceUrl path 기반 폴백 (share_id 변형 대비)
  // 단, 같은 sourceUrl을 쓰는 다른 대화가 남아있으면 fallback 삭제는 건너뛴다
  // (그 대화가 참조하는 센터 카드까지 함께 사라지는 것을 방지)
  const baseSourceUrl = target.sourceUrl ? target.sourceUrl.split('?')[0] : ''

  let hasSiblingConversation = false
  if (baseSourceUrl) {
    const sibling = await prisma.conversation.findFirst({
      where: {
        userId,
        id: { not: params.id },
        sourceUrl: { startsWith: baseSourceUrl },
      },
      select: { id: true },
    })
    hasSiblingConversation = !!sibling
  }

  await prisma.characterCollection.deleteMany({
    where: {
      userId,
      OR: [
        { conversationId: params.id },
        ...(baseSourceUrl && !hasSiblingConversation
          ? [{ sourceUrl: { startsWith: baseSourceUrl }, conversationId: null }]
          : []),
      ],
    },
  })
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 전체 테스트 실행**

Run: `cd apps/web && npx vitest run`
Expected: PASS (기존 83개 테스트 모두 통과 — 이 변경은 DB 의존 로직이라 단위테스트 대상 아님)

- [ ] **Step 4: 커밋**

```bash
cd apps/web && git add app/api/conversations/[id]/route.ts && git commit -m "Fix: 같은 sourceUrl을 쓰는 다른 대화가 남아있으면 대화 삭제 시 캐릭터카드 컬렉션을 보존"
```

- [ ] **Step 5: apps/web을 main에 푸시**

```bash
cd apps/web && git push origin main
```

- [ ] **Step 6: 부모 저장소 서브모듈 포인터 업데이트 + 푸시**

저장소 루트(`/c/StoryFit`)에서:

```bash
git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (대화 삭제 시 캐릭터카드 삭제 방지)" && git push origin master
```

---

## Self-Review 체크리스트 (참고용 — 구현자는 무시)

- 스펙의 "변경 사항"(sibling 확인 후 fallback 분기) → Task 1 Step 1
- 스펙의 "영향 범위"(conversationId 직접 매핑은 변경 없음, 분기 로직 변경 없음) → Step 1 코드에서 첫 번째 OR 조건과 111줄 이후 로직은 그대로 유지
- 스펙의 비목표(completion.ts, 새 컬렉션 생성 구조 변경 없음) → 이 플랜에서 다루지 않음
