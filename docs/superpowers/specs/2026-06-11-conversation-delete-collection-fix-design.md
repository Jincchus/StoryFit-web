# 대화 삭제 시 다른 대화가 참조하는 캐릭터 카드(컬렉션) 삭제 방지 설계

**작성일:** 2026-06-11
**상태:** 승인됨

## 목표

ZETA(또는 동일 sourceUrl 기반) 캐릭터로 진행중인 대화방이 여러 개 있을 때, 그 중 하나를 삭제해도 다른 대화방이 참조하는 캐릭터 카드(센터 목록)가 사라지지 않도록 한다.

## 배경

- ZETA 플롯 import 시 `CharacterCollection`이 `conversationId: null`, `sourceUrl: <zeta-ai.io URL>`로 생성되어 ZETA 센터 카드 목록(`GET /api/collections?isZeta=true`)에 노출된다.
- ZETA 센터에서 같은 캐릭터로 "추가 대화 생성"을 하면, 새 `Conversation`도 동일한 `sourceUrl`을 `convSourceUrl`로 복사받는다(`app/api/conversations/route.ts:63-72`). 즉 같은 sourceUrl을 가진 대화방이 여러 개 존재할 수 있다.
- `app/api/conversations/[id]/route.ts:98-109`의 DELETE 핸들러는 삭제 대상 대화의 `sourceUrl`(쿼리스트링 제거한 base)과 일치하고 `conversationId: null`인 `CharacterCollection`을 함께 삭제한다(원래 의도: "URL 직접 등록"으로 만들어진, 대화 1개에만 연결된 컬렉션을 그 대화 삭제 시 같이 정리).
- 이 fallback 조건은 "이 sourceUrl을 쓰는 다른 대화가 남아있는지"를 확인하지 않으므로, 추가 생성한 대화방을 삭제하면 같은 sourceUrl을 공유하는 기존 대화방이 멀쩡히 남아있어도 컬렉션(=캐릭터 카드)이 삭제되어 ZETA 센터에서 카드 자체가 사라진다.

## 변경 사항

`app/api/conversations/[id]/route.ts`의 DELETE 핸들러에서, sourceUrl 기반 fallback 삭제를 실행하기 전에 같은 사용자의 같은 `baseSourceUrl`(prefix)을 가진 **다른 대화방**(`id !== params.id`)이 남아있는지 확인한다. 남아있으면 fallback 컬렉션 삭제를 건너뛴다.

`conversationId: params.id` 직접 매핑 조건(98-105번째 줄의 첫 번째 OR 조건)은 변경하지 않는다 — 이 대화에 직접 연결된 컬렉션은 이 대화가 삭제되면 항상 함께 정리되어야 한다(기존 동작 유지).

### 의사 코드

```ts
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

`target.sourceUrl`은 이미 DELETE 핸들러 92-95줄의 `prisma.conversation.findFirst` select에 포함되어 있으므로 추가 조회 없이 사용 가능. sibling 조회는 `sourceUrl`이 빈 문자열이 아닐 때만 수행한다.

## 영향 범위

- `app/api/conversations/[id]/route.ts`의 DELETE 핸들러 1곳만 수정.
- `conversationId: params.id` 직접 매핑 케이스(이 대화 전용 컬렉션)는 영향 없음 — 항상 기존대로 삭제됨.
- sourceUrl 기반 fallback은 "이 sourceUrl을 쓰는 마지막 대화를 지울 때만" 동작 — 기존 단일 대화 시나리오(URL 직접 등록 후 그 대화만 삭제)는 동작 동일.
- 분기(rootConversationId) 관련 로직(111-146번째 줄)은 변경하지 않는다.

## 테스트

- 단위 테스트로 검증하기 어려운 DB 의존 로직이므로(Prisma 통합 테스트 인프라 부재), 코드 리뷰 + 수동 시나리오 확인으로 검증한다:
  1. 같은 sourceUrl을 가진 대화방 2개 존재 → 1개 삭제 → 컬렉션(카드) 유지, 남은 대화방 정상 조회 확인.
  2. 단일 대화방(직접 URL 등록) → 삭제 → 기존처럼 `conversationId: null` 컬렉션도 함께 삭제 확인.
  3. `conversationId`가 이 대화로 직접 연결된 컬렉션이 있는 경우 → 삭제 → 항상 함께 삭제 확인 (sibling 존재 여부 무관).

## 비목표 (Out of Scope)

- `lib/completion.ts`의 완결 판정 로직 변경 없음 (별도 이슈에서 배제됨).
- 분기(branch)/루트 승격 로직(111-146번째 줄) 변경 없음.
- ZETA "추가 대화 생성" 시 새 `CharacterCollection`을 생성하도록 구조를 바꾸는 것은 더 큰 리팩터이므로 다루지 않는다.
