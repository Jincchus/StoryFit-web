# 완결(Completion) 상태 관리 설계

**작성일:** 2026-06-10
**상태:** 승인됨

## 목표

대화가 서재(`isArchived`)로 보관되면 해당 캐릭터/세계관을 "완결"로 분류하여, 캐릭터 선택 페이지와 WHIF/ZETA/MELTING 센터에 각각 완결 탭으로 정리한다. 진행 중 대화가 다시 생기면 자동으로 원래 탭으로 복귀한다.

## 핵심 결정사항

- **완결 = 파생 상태**: 별도 스키마/플래그 없이 대화의 `isArchived`에서 즉석 계산. 서재 토글이 단일 진실 공급원(single source of truth).
- 완결 기준: 엔티티에 **활성(비서재) 대화가 0개**일 때.
- 센터 완결 단위: **세계관(컬렉션) 단위**. 단, 완결된 대화가 있던 캐릭터에는 개별 "완결" 뱃지.
- 캐릭터 페이지 완결 탭: 보기 + 복제 + 삭제. 대화 재개는 서재에서만.

## 1. 판정 규칙 & 데이터 모델

**스키마 변경 없음.**

대화 집계 시 공통 필터 (기존 채팅목록 GET과 동일):
- `rootConversationId = null` (브랜치 제외)
- `mode ≠ 'assistant'` (AI 채팅 제외)

엔티티별 집계:
- `activeCount` = 위 필터 + `isArchived = false` 대화 수
- `archivedCount` = 위 필터 + `isArchived = true` 대화 수

판정식:
- **completed** = `activeCount === 0 && archivedCount > 0`
- **hasArchived** (완결 뱃지) = `archivedCount > 0` — 캐릭터가 표시되는 모든 화면에 적용
- 대화 0개(`archivedCount === 0`) → 진행 탭, 완결 아님

연결 기준:
- 캐릭터의 대화: `ConversationCharacter.characterId === character.id`
- 컬렉션의 대화: 참여 캐릭터 중 하나라도 `character.collectionId === collection.id`

적용 단위:
- `/characters` 페이지 → **캐릭터 단위**
- WHIF / ZETA / MELTING 센터 → **컬렉션 단위**
- 같은 캐릭터가 두 화면에 서로 다른 단위로 보일 수 있음 (의도된 동작)

## 2. API 변경

### `GET /api/characters`
- 각 캐릭터에 대해 `activeCount` / `archivedCount`를 집계.
- 응답 객체에 `completed: boolean`, `hasArchived: boolean` 추가.
- 프리셋 캐릭터는 유저 대화가 없어 항상 `completed=false, hasArchived=false`.

### `GET /api/collections`
- 각 컬렉션에 대해 컬렉션 단위 `activeCount` / `archivedCount` 집계 (소속 캐릭터 기준).
- 응답에 `completed: boolean` 추가.
- 소속 캐릭터 배열의 각 항목에 `hasArchived: boolean` 추가 (뱃지용).

### `POST /api/characters/[id]/duplicate` (신규)
- 원본 캐릭터 소유자(`creatorId === userId`) 검증.
- 복사 대상 필드: `name`(접미사 " (복제)"), `gender`, `avatarUrl`, `tags`, `additionalInfo`, `exampleDialogues`, `openingMessage`, `openingMessages`, `safetyLevel`, `temperature`, `frequencyPenalty`, `maxOutputTokens`, `thinkingBudget`, `defaultAI`, `relatedImages`.
- 설정: `creatorId = userId`, `collectionId = null`, `isPreset = false`, `isAutoCreated = false`. 대화 0개.
- 캐릭터 스코프 로어북(`Lorebook.characterId === 원본.id`) 복사하여 새 캐릭터에 연결.
- 응답: 생성된 캐릭터(201).

## 3. UI — 캐릭터 선택 페이지 (`/characters`)

상단에 탭 토글 추가: **`진행 중` / `완결 캐릭터`** (기본값 `진행 중`).

- `진행 중` 탭: `completed === false` 캐릭터. 기존 컬렉션 필터 탭과 선택/다음 버튼 그대로 유지.
- `완결 캐릭터` 탭:
  - `completed === true` 캐릭터만 표시.
  - 각 카드에 "완결" 뱃지.
  - 카드 버튼: **복제**, **삭제**만. (선택 모드, "다음 →" 등 대화 시작 동선 숨김)
  - 빈 상태/안내: "이어가려면 서재에서 꺼내세요" 문구로 서재 유도.
- 완결 뱃지(`hasArchived`)는 진행 탭에서도 표시 가능 (예: 활성 대화 + 완결 대화 둘 다 있는 캐릭터).

## 4. UI — 센터 (WHIF / ZETA / MELTING)

각 센터 목록 상단에 탭 토글 추가: **`진행 중` / `완결`** (기본값 `진행 중`).

- `진행 중`: `completed === false` 컬렉션.
- `완결`: `completed === true` 컬렉션.
- **완결 탭에서도 카드 클릭 → 상세 → 대화 시작 가능** (정상 동작). 새 대화가 생기면 `activeCount > 0`이 되어 다음 조회부터 자동으로 진행 탭으로 복귀.
- WHIF은 캐릭터 그리드이지만 완결 판정은 **세계관(컬렉션) 단위** — 같은 세계관 캐릭터는 함께 이동.
  - ZETA/MELTING은 이미 컬렉션 단위 그리드이므로 컬렉션 `completed`로 직접 필터.
  - WHIF은 캐릭터 카드를 소속 컬렉션의 `completed` 기준으로 진행/완결 그룹에 배치.
- 완결 탭 내 캐릭터 중 `hasArchived === true`인 캐릭터에 개별 "완결" 뱃지.

## 5. 복제 동작 (캐릭터)

완결 캐릭터 카드의 `복제` 클릭 → `POST /api/characters/[id]/duplicate` → 새 캐릭터 생성(컬렉션 링크 없음) → 목록 새로고침 → 일반 `진행 중` 탭에 등장. 사용자는 복제본으로 같은 캐릭터의 새 세계관/대화를 시작한다.

## 6. 엣지 케이스

- 프리셋 캐릭터: 유저 대화 없음 → 항상 진행 탭.
- 브랜치 대화(`rootConversationId ≠ null`), assistant 모드: 집계에서 제외.
- 멀티스토리 대화 완결: 컬렉션의 마지막 활성 대화였다면 컬렉션 완결, 참여 캐릭터 모두 뱃지.
- 서재 꺼내기(unarchive): `activeCount > 0`이 되어 다음 조회 시 자동으로 진행 탭 복귀 (별도 이벤트 처리 불필요).
- 대화 0개 신규 캐릭터/컬렉션: 진행 탭 (완결 아님).

## 비목표 (Out of Scope)

- 완결을 의미하는 별도 "완료로 표시" 버튼 추가 — 기존 서재(📚) 동작을 그대로 재사용.
- `/characters` 페이지에서 센터 캐릭터 노출 정책 변경 — 기존 동작 유지.
- 센터 완결 탭에서의 캐릭터 복제 — 복제는 `/characters` 완결 탭 전용.

## 공개 인터페이스 요약

| 항목 | 입력 | 출력/효과 |
|------|------|-----------|
| `GET /api/characters` | (기존) | 캐릭터별 `completed`, `hasArchived` 추가 |
| `GET /api/collections` | (기존) | 컬렉션별 `completed`, 캐릭터별 `hasArchived` 추가 |
| `POST /api/characters/[id]/duplicate` | 캐릭터 id | 복제 캐릭터(201), 로어북 복사 |
| `/characters` UI | — | 진행/완결 탭, 완결 탭 복제·삭제, 완결 뱃지 |
| 센터 UI ×3 | — | 진행/완결 탭, 완결 뱃지 |
