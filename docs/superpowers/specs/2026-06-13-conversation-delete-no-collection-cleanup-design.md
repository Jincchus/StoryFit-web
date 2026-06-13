# 대화 삭제 시 캐릭터카드(컬렉션) 자동 정리 로직 제거

**작성일:** 2026-06-13
**상태:** 승인됨

## 배경

`app/api/conversations/[id]/route.ts`의 DELETE 핸들러는 대화를 삭제하면서 다음 두 조건 중 하나에 해당하는
`CharacterCollection`(ZETA/멜팅/WHIF 센터 카드)을 함께 삭제하거나 재연결한다:

1. `conversationId === 이 대화ID` (컬렉션이 이 대화에 직접 연결됨)
2. `sourceUrl` 기반 fallback — 같은 baseSourceUrl을 쓰는 다른 대화가 남아있지 않으면 삭제

조건 1은 현재 코드베이스 어디에서도 `CharacterCollection.conversationId`에 실제 대화 ID를 쓰는 곳이 없어
사실상 죽은 분기다. 실제로 동작하는 것은 조건 2이며, 흔한 흐름은:

1. ZETA URL import → 카드 생성 (`sourceUrl: zeta-ai.io/...`, `conversationId: null`)
2. "대화 시작하기" → 대화 1개 생성, 같은 `sourceUrl` 복사
3. 이 대화방을 채팅 목록에서 삭제(단순 정리 목적) → 같은 sourceUrl을 쓰는 다른 대화가 없으므로 **카드가 함께 삭제됨**

카드는 ZETA/멜팅/WHIF 센터에 "저장해둔 캐릭터" 목록이고, 대화방은 그 캐릭터로 진행한 채팅 인스턴스다.
채팅방 정리(가벼운 행동)가 저장된 카드 삭제(무거운 행동)로 이어지는 것은 사용자 기대와 맞지 않는다.
카드를 영구 삭제하려면 `/api/collections/[id]` DELETE(명시적 "카드 삭제", 캐릭터까지 캐스케이드 삭제)를
쓰면 된다.

## 변경 사항

`app/api/conversations/[id]/route.ts`의 DELETE 핸들러에서 `CharacterCollection` 관련 정리 로직
(조건 1, 2 전체 — sourceUrl/sibling 조회 + candidateCollections 루프)을 전부 제거한다.
대화 삭제는 오직 대화/메시지(및 분기 승격)에만 영향을 준다.

레거시 데이터에 `CharacterCollection.conversationId`가 삭제 대상 대화를 가리키는 행이 남아있더라도,
`conversationId`는 optional FK이므로 Prisma 기본 동작(`SET NULL`)에 의해 컬렉션은 보존되고
`conversationId`만 `null`이 된다 — 추가 코드 불필요.

분기(branch) 승격 로직(루트 삭제 시 가장 오래된 분기를 새 루트로 승격)은 컬렉션과 무관하므로 그대로 유지한다.
`target` 조회의 `sourceUrl` select는 더 이상 쓰이지 않으므로 함께 제거한다.

## 영향 범위

- `app/api/conversations/[id]/route.ts`의 DELETE 핸들러 1곳만 수정.
- `/api/collections/[id]` DELETE(명시적 카드 삭제, 캐릭터 캐스케이드 포함)는 변경 없음.
- PATCH 핸들러의 "제목 변경 시 컬렉션 제목 동기화"(`conversationId: params.id` 기준)는 변경 없음 —
  대화 삭제와 무관한 별개 동작.

## 테스트

- DB 의존 로직이라 단위 테스트 대상 아님. `npx tsc --noEmit` + `npx vitest run`으로 회귀 확인.
- 수동 시나리오: ZETA 카드 import → 대화 시작 → 그 대화만 삭제 → ZETA 센터에 카드가 그대로 남는지 확인.

## 비목표 (Out of Scope)

- `/api/collections/[id]` DELETE의 캐스케이드 동작 변경 없음.
- `lib/completion.ts` 완결 판정 로직 변경 없음.
