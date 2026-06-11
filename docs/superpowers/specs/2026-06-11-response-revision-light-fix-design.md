# AI 응답 재작성(2차 streamChat) 최소화 설계

**작성일:** 2026-06-11
**상태:** 승인됨

## 목표

AI 응답이 1차로 화면에 다 표시된 뒤, 가벼운 형식 위반 때문에 처음부터 다시 `streamChat`을 돌려 화면 내용을 통째로 교체하는 일을 줄인다. 응답 시간을 단축하고, "다 나온 줄 알았는데 사라지고 다시 받아오는" 사용자 경험을 없앤다.

## 배경

`lib/responseControl.ts`의 `needsResponseRevision()`이 true를 반환하면 `app/api/conversations/[id]/chat/route.ts:295-306`에서 `regenerateControlledResponse`가 1차 응답과 동일한 history로 `streamChat`을 처음부터 다시 호출해 응답을 통째로 교체한다. 이는 동기적으로 실행되어 응답 시간이 거의 2배가 된다.

현재 `needsResponseRevision`의 트리거 조건:
1. `trimmed.length < 350` — 350자 미만이면 무조건 재작성. 정상적인 짧은 대사도 항상 재생성됨.
2. `!allowChoices && CHOICE_PATTERNS` — 선택지 비허용 모드인데 AI가 선택지/질문형 마무리를 덧붙인 경우.
3. `allowChoices && hasForbiddenChoiceSpeaker` — 선택지 블록에 AI 캐릭터(금지 인물) 이름이 등장.
4. `allowChoices && missesRequiredBodySpeaker` — 본문에 AI 캐릭터의 대사가 없음.
5. `USER_CONTROL_PATTERNS` — 유저 페르소나의 행동/감정/결정을 AI가 임의로 서술.
6. `personaName` 대사/행동 패턴 — 본문에 유저 페르소나의 대사(`이름 :`) 또는 행동 묘사가 있음.

## 변경 사항

조건을 "가벼운 후처리로 고칠 수 있는 것"과 "구조적으로 다시 써야 하는 것"으로 나눈다.

### 가벼운 후처리 (재생성 없이 텍스트만 다듬음)

- **조건 1 (350자 미만) 트리거 제거**: 후처리로 글자수를 늘릴 수 없으므로, 단독 사유로는 재작성하지 않는다. 시스템 프롬프트의 "응답이 짧아지면 안 됨" 지시문에만 맡긴다.
- **조건 2 (`!allowChoices`인데 선택지/질문형 마무리)**: 새 함수 `stripChoiceArtifacts(text)`로 해당 부분만 잘라낸다.
  - `---`/`***`/`===` 같은 구분선(`SEP_RE`)으로 본문/선택지가 나뉘어 있으면, 구분선 이후(선택지 블록)를 통째로 제거하고 본문만 남긴다.
  - 구분선이 없으면, 끝에서부터 `CHOICE_PATTERNS`에 매치되는 줄을 제거한다 (빈 줄은 건너뜀).

이 두 가지는 새 함수 `applyLightFixes(text, options)`로 묶어서, 재작성 여부 판정 전에 항상 적용한다.

### 재작성 유지 (구조적 위반 — 후처리로 고치기 어려움)

- 조건 3, 4, 5, 6은 그대로 `needsResponseRevision`에 남겨 기존처럼 `regenerateControlledResponse`를 호출한다.

### 호출 흐름 변경 (`app/api/conversations/[id]/chat/route.ts:286-306`)

```ts
let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(fullText), prevAssistantText)
cleanText = applyLightFixes(cleanText, revisionOptions)

if (needsResponseRevision(cleanText, revisionOptions)) {
  const revised = await regenerateControlledResponse({ ... cleanText 대신 적용된 cleanText 사용 ... })
  ...
}
```

`applyLightFixes`는 `revisionOptions`(`allowChoices` 등)를 그대로 받아 동일한 `allowChoices` 판정을 사용한다.

## 영향 범위

- `lib/responseControl.ts`: `needsResponseRevision`에서 조건 1, 2 제거. 새 함수 `stripChoiceArtifacts`, `applyLightFixes` 추가.
- `app/api/conversations/[id]/chat/route.ts`: 1차 응답 정제 직후 `applyLightFixes` 호출 추가 (1곳).
- `buildRevisionPrompt`, 조건 3~6의 동작/메시지는 변경 없음.

## 테스트

- `lib/responseControl.test.ts` (신규):
  - `needsResponseRevision`: 350자 미만 + 위반 없음 → false (기존엔 true였음).
  - `needsResponseRevision`: `!allowChoices`인데 선택지 패턴 포함 → false (이제 light fix 대상이라 재작성 트리거 아님).
  - `needsResponseRevision`: 조건 3~6은 기존과 동일하게 true.
  - `stripChoiceArtifacts`: 구분선 있는 경우 선택지 블록 제거, 구분선 없는 경우 끝의 선택지/질문 줄 제거.
  - `applyLightFixes`: `allowChoices=true`면 변경 없음, `allowChoices=false`면 선택지 흔적 제거.

## 비목표 (Out of Scope)

- 조건 3~6(구조적 위반)에 대한 후처리/부분 재작성 로직 변경 없음 — 그대로 전체 재생성.
- `streamChat`, 폴링 주기, 메모리 요약/스토리 평가 등 비동기 후처리 로직 변경 없음.
