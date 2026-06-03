# 핵심메모리 승격(Promote) — 영구 표시 + 다중선택 AI 요약 설계

> 작성: 2026-06-03 · 대상: `apps/web` (Next.js 14 + Prisma + Gemini)
> 관련 코드: `app/(main)/conversations/[id]/page.tsx`, `_hooks/useMemoryPanel.ts`, `app/api/conversations/[id]/memories/`, `lib/memorySummarization.ts`, `prisma/schema.prisma`

## 1. 문제 (현재 동작)

장기 메모리 항목을 "핵심 메모리로 올리기" 하면, 선택한 요약 텍스트를 핵심메모리에 **이어붙이기만** 한다. "올렸다"는 별도 기록이 없다.

- "↑ 핵심" 배지는 오직 `coreMemory.includes(mem.summary)` 문자열 매칭으로 판정한다 (`page.tsx:1331`).
- 따라서 핵심메모리 텍스트를 조금이라도 수정하면 매칭이 깨져 **배지가 사라진다** → "올린 건지 확인이 안 됨".
- 승격은 `handleCoreMemory` → `debouncedPatch`(디바운스 저장)이라, 그 사이 ↺ 새로고침/refetch가 서버의 옛 값으로 덮어쓰면 **편집이 되돌아간다** ("돌아갔다").

## 2. 목표

1. **영구 표시**: 한 번 승격한 항목은 핵심메모리 텍스트를 어떻게 수정해도 "↑ 핵심" 배지가 유지된다 (문자열 매칭 → DB 플래그).
2. **revert 제거**: 승격 시 핵심메모리를 서버에 **즉시 저장**한다 (디바운스 경합 제거).
3. **다중선택 AI 요약**: 2개 이상 선택해 올리면 AI가 하나로 압축 요약한 뒤 핵심메모리에 이어붙인다. 단독 선택은 그대로 올린다.

비목표(YAGNI): 승격 취소(unpromote), 핵심메모리 자동 재요약, statusTimeline 연동.

## 3. 데이터 모델

`prisma/schema.prisma` — `Memory` 모델에 필드 추가:

```prisma
model Memory {
  ...
  promoted Boolean @default(false)
  ...
}
```

마이그레이션 1건. 기존 행은 `false`로 초기화된다 (과거에 문자열로 올렸던 항목은 배지가 사라지지만, 다시 올리면 플래그가 박힌다 — 허용).

## 4. 서버: 승격 엔드포인트

새 핸들러: `POST /api/conversations/[id]/memories/promote`

- 인증 + 소유권 검증 (기존 `memories/route.ts` 패턴 재사용).
- Body: `{ memoryIds: string[] }`. 비었으면 400.
- 대화(`coreMemory`, 캐릭터 systemPrompt)와 **해당 대화에 속한** 선택 메모리만 로드. 소유하지 않은 id는 무시/거르기.
- **단독(1개)**: `condensed = 그 메모리의 summary` (AI 호출 없음, 그대로).
- **다중(2개+)**: `condensed = await condenseForCoreMemory(요약들, 기존 coreMemory, characterSystemPrompt)` (아래 §6).
- `newCoreMemory = 기존.trim() ? 기존.trim() + '\n\n' + condensed : condensed` (이어붙이기).
- **트랜잭션**: `Conversation.coreMemory = newCoreMemory` 갱신 + `Memory.promoted = true` (`updateMany`, 선택 id들).
- 응답: `{ coreMemory: newCoreMemory, promotedIds: string[] }`.

이 경로가 핵심메모리를 서버에 즉시 영속하므로 디바운스 revert가 발생하지 않는다.

## 5. 클라이언트

`_hooks/useMemoryPanel.ts` + `page.tsx`:

- `MemoryEntry` 타입에 `promoted: boolean` 추가. GET `/memories`는 이미 모델 전체를 반환하므로 자동 포함.
- 배지 판정: `const isPromoted = mem.promoted` (문자열 매칭 제거).
- `handlePromoteMemories`:
  1. 로딩 시작(`promoting` 상태) → 다중선택이면 "요약 중..." 표시 + 버튼 비활성.
  2. `POST /api/conversations/${convId}/memories/promote` with `{ memoryIds: [...selectedMemoryIds] }`.
  3. 성공: `onCoreMemoryUpdated(res.coreMemory)`로 `conv.coreMemory` 갱신, 로컬 `memories`에서 해당 id들 `promoted=true`로 갱신, 선택 해제, 토스트("핵심 메모리에 추가됐습니다").
  4. 실패: 토스트("핵심 메모리 추가에 실패했습니다").
- 기존 동작 유지: 승격 항목은 접힌 채 "↑ 핵심" 배지, 클릭하면 펼침(`toggleExpandPromoted`).
- 수동 textarea 편집은 기존 `handleCoreMemory`(`debouncedPatch`) 그대로 — 승격 경로와 무관.

## 6. AI 요약 (다중선택 압축)

`lib/memorySummarization.ts`에 함수 추가 — 기존 `generateText(systemPrompt, userPrompt)` 재사용.

**핵심메모리의 성격**: 매 턴 무조건 주입되는 자리(조립 순서 position 2)이므로 **토큰 효율적인 지속 사실**이어야 한다. 과거 사건의 시간순 로그는 장기메모리(임베딩 검색, position 7)의 몫이다. 따라서 압축은 "무슨 일이 있었나(나열)"가 아니라 "그 결과 지금 무엇이 사실/상태/미해결인가"로 증류한다.

**System:**
```
당신은 롤플레이 대화의 '핵심 기억' 정리 전문가입니다.
핵심 기억은 AI가 대화 내내 절대 잊으면 안 되는 '지속 사실·관계 상태'와 '현재 상황·미해결 줄거리'입니다.
캐릭터 설정: {characterSystemPrompt}
```

**User:**
```
아래 대화 요약들을 '핵심 기억'으로 정리하세요.

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
{기존 핵심메모리}

대화 요약들:
{선택한 요약들을 줄바꿈으로 연결}
```

설계 의도: 1~4는 토큰 효율적인 현재 상태, 5는 무한 로그를 피하려 "현재+직접 이유"로 한정, 6(미해결·목표·위협)은 롤플레이 연속성에 가장 결정적이라 별도 카테고리로 분리. "최신 우선" 규칙으로 모순 누적 방지.

## 7. 테스트

- **`condenseForCoreMemory`** (단위, `generateText` 목): 프롬프트에 6개 카테고리 머리글과 "이미 적힌 핵심메모리" 컨텍스트, 선택 요약들이 포함되는지 검증. 반환값이 그대로 전달되는지.
- **승격 분기**: 단독선택 → AI 미호출, 요약 그대로 사용 / 다중선택 → `condenseForCoreMemory` 호출. (라우트 또는 분리한 순수 헬퍼 단위로.)
- **배지 판정**: `isPromoted`가 `mem.promoted` 플래그를 따름.
- 라우트 통합 테스트(인증/소유권/트랜잭션)는 기존 테스트 인프라 범위에 맞춰 플랜 단계에서 확정.

## 8. 배포

CLAUDE.md 절차 준수:
1. `apps/web` (main 브랜치): 파일 커밋 → `git push origin main`.
2. 부모 레포(master): 서브모듈 포인터 커밋 → `git push origin master`.
3. 서버: `git pull && git submodule update --remote apps/web && docker compose up --build -d`. **마이그레이션 적용 필요** (`prisma migrate deploy`)— 빌드/기동 절차에 포함되는지 확인, 누락 시 수동 실행.

## 9. 영향 파일 요약

- `prisma/schema.prisma` — `Memory.promoted` 추가 + 마이그레이션
- `lib/memorySummarization.ts` — `condenseForCoreMemory` 추가
- `app/api/conversations/[id]/memories/promote/route.ts` — 신규 POST
- `app/(main)/conversations/[id]/_hooks/useMemoryPanel.ts` — promote가 API 호출, promoted 플래그 관리
- `app/(main)/conversations/[id]/page.tsx` — `isPromoted` 플래그 기반, 로딩 표시
- 테스트 파일(들)
