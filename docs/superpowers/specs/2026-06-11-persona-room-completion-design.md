# 페르소나 대화방 태그 + 완결 연동 설계

**작성일:** 2026-06-11
**상태:** 승인됨

## 목표

`/characters` 페이지에서, 사용자가 **페르소나(personaCharacterId)** 로 참여한 대화도 캐릭터의 완결 판정에 포함시킨다. 또한 캐릭터 카드에 "참여한 대화방" 태그를 표시하고, 완결 탭에서 대화방 단위로 필터링할 수 있게 한다.

## 배경

기존 완결 판정(`docs/superpowers/specs/2026-06-10-completion-state-design.md`)은 캐릭터가 **AI 캐릭터로 참여한 대화**(`ConversationCharacter`)만 집계했다. 사용자가 직접 만든 페르소나 캐릭터는 보통 `ConversationCharacter`로 등장하지 않고 `Conversation.personaCharacterId`로만 연결되므로, 대화가 모두 서재로 보내져도 항상 "진행 중" 탭에 남아 있었다.

페르소나도 일반 캐릭터와 동일하게 취급한다: 관련된 모든 대화방이 완결되면 완결 탭으로 이동하고, 복제해서 재사용할 수 있다.

## 1. 완결 판정 통합

`GET /api/characters` (`app/api/characters/route.ts`):

- 기존 `convsByChar` (AI 캐릭터로 참여한 대화, `ConversationCharacter` 경유) 집계는 그대로 유지.
- 추가로 `Conversation.personaCharacterId === character.id`인 대화를 조회한다. 필터는 기존과 동일:
  - `userId` 일치
  - `rootConversationId = null` (브랜치 제외)
  - `mode ≠ 'assistant'`
- 두 집합(AI 캐릭터 참여 대화 + 페르소나 참여 대화)을 하나의 배열로 합쳐 `aggregateCounts()`에 전달.
- `completed`/`hasArchived`는 이 통합 집계 결과로 계산한다 (기존 `isCompleted`/`hasArchived` 함수 재사용, `lib/completion.ts` 변경 없음).

즉: "이 캐릭터와 관련된 모든 대화방(AI 캐릭터 역할이든 페르소나 역할이든)이 서재로 가야 완결".

## 2. `rooms` 필드 (참여 대화방 태그)

`GET /api/characters` 응답의 각 캐릭터에 `rooms: { id: string; title: string }[]` 추가:

- 캐릭터에 `collection`이 있으면 `{ id: collection.id, title: collection.title }`을 포함.
- 페르소나로 참여한 각 대화(위 1번과 동일 필터: 브랜치 제외, `mode ≠ 'assistant'`)의 `{ id: conversation.id, title: conversation.title }`을 포함.
- `id` 기준 중복 제거.
- 출처(일반 채팅 / 서재 / WHIF·ZETA·MELTING 센터)는 구분하지 않는다 — 모두 `Conversation` 레코드이므로 동일하게 취급.

## 3. UI — `/characters` 페이지

### 카드 태그
- 진행/완결 탭 공통으로, 카드에 `rooms`를 작은 칩(chip)으로 표시.
- 최대 2개까지 표시하고, 그 이상은 "+N" 형태로 축약 (예: `세계관A`, `대화방B`, `+2`).
- 기존 `collection.title` 단일 뱃지(우상단, 진행 탭 전용)는 `rooms`의 첫 항목과 중복될 수 있으나, 별도 정리 없이 `rooms` 칩으로 통합 표시한다 (기존 단일 뱃지는 `rooms` 칩으로 대체).

### 완결 탭 대화방 필터
- 완결 탭 상단에 칩 형태의 필터 목록 추가: "전체" + 완결된 캐릭터들의 `rooms`를 모두 모아 `id` 기준 중복 제거한 목록.
- 필터 상태: `roomFilter: string` (기본값 `'all'`).
- 필터 적용: `roomFilter === 'all'` 이면 전체 완결 캐릭터 표시, 아니면 `c.rooms.some(r => r.id === roomFilter)`인 캐릭터만 표시.
- 진행 탭의 기존 `collectionFilter` 칩 목록과는 별개의 UI/상태 (진행 탭 필터는 변경 없음).

## 4. 복제 / 삭제

기존 완결 탭의 복제(`POST /api/characters/[id]/duplicate`)·삭제 동작 변경 없음 — 페르소나 캐릭터도 동일하게 복제/삭제 가능.

## 5. 엣지 케이스

- 페르소나로 참여한 대화가 0개이고 AI 캐릭터로 참여한 대화도 0개인 캐릭터: `archivedCount === 0` → 완결 아님 (기존 규칙 유지).
- 한 캐릭터가 AI 캐릭터 역할과 페르소나 역할을 동시에 가질 수 있음 — 두 역할의 대화를 모두 합산.
- `rooms`가 비어있는 캐릭터(컬렉션 없음 + 페르소나 참여 대화 없음): 칩 표시 없음, 완결 탭 필터 목록에도 등장하지 않음.
- 완결 탭에서 `roomFilter`로 필터링한 상태에서 새 대화가 생겨 캐릭터가 진행 탭으로 돌아가면, 다음 새로고침 시 자동으로 완결 탭/필터 목록에서 제외됨 (별도 처리 불필요).

## 비목표 (Out of Scope)

- WHIF/ZETA/MELTING 센터 — 컬렉션 단위 완결 로직 변경 없음.
- ZETA guest/user 페르소나 매핑 수정, 한국어 조사(은/는/이/가) 자동 처리 — 별도 스펙으로 진행.

## 공개 인터페이스 요약

| 항목 | 입력 | 출력/효과 |
|------|------|-----------|
| `GET /api/characters` | (기존) | `completed`/`hasArchived`에 페르소나 참여 대화 포함, `rooms: {id,title}[]` 추가 |
| `/characters` UI | — | 카드에 `rooms` 칩 표시, 완결 탭에 대화방 필터 칩 추가 |
