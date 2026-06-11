# 오프닝 장면 연속성 강화 설계

**작성일:** 2026-06-11
**상태:** 승인됨

## 목표

대화 시작 시 설정된 인트로(오프닝 장면)에서 형성된 감정/갈등/상황을, 유저의 첫 메시지에 대한 AI의 응답이 자연스럽게 이어받도록 한다.

## 배경

- 인트로가 "둘이 싸우던 상황"인데, 유저가 그 상황에 맞춰 "도대체 너 왜 그래?"라고 보내도, AI가 싸우던 맥락을 이어가지 않고 질문 자체에만 반응하는 경우가 약 2/3 빈도로 발생.
- `lib/systemPrompt.ts`의 `buildOpeningSceneSection(openingScene)`은 현재 `[오프닝 장면 — 대화의 시작]\n${openingScene}` 형태로만 삽입되어, AI가 이를 "배경 설정 정보"로 취급하고 "방금 일어난 일 = 현재 진행 중인 상황"으로 인식하지 못하는 것으로 보임.
- 이 함수는 `buildSystemPrompt`, `buildNovelSystemPrompt`, `buildStorySystemPrompt`, `buildMultiStorySystemPrompt` 4개 빌더가 공통으로 호출한다(`lib/systemPrompt.ts`).

## 변경 사항

`buildOpeningSceneSection()`이 반환하는 문자열에, 오프닝 장면이 "대화 시작 직전에 일어난 일이며 현재 진행 중인 상황"임을 명시하고, 첫 응답이 그 장면에서 형성된 감정/갈등/상황을 그대로 이어받아야 한다는 지시문을 추가한다.

```ts
function buildOpeningSceneSection(openingScene?: string): string {
  return openingScene?.trim()
    ? `[오프닝 장면 — 대화의 시작]\n${openingScene.trim()}\n\n위 오프닝 장면은 대화가 시작되기 직전에 일어난 일이며, 현재 진행 중인 상황입니다. 첫 응답은 이 장면에서 형성된 감정, 갈등, 분위기, 상황을 그대로 이어받아 자연스럽게 진행해야 합니다. 장면을 리셋하거나, 오프닝과 무관한 반응을 하거나, 갈등/감정 상태를 임의로 해소하지 마세요.`
    : ''
}
```

함수 시그니처와 호출부(4개 빌더)는 변경하지 않는다 — 함수 내부 반환 문자열만 수정.

## 영향 범위

- `lib/systemPrompt.ts`의 `buildOpeningSceneSection` 한 곳만 수정.
- 4개 프롬프트 빌더(roleplay/novel/story/multiStory) 전체에 자동 적용.
- `openingScene`이 비어있는 경우(빈 문자열) 동작은 기존과 동일(빈 문자열 반환, 섹션 미생성).

## 테스트

- `lib/systemPrompt.test.ts`에 `buildOpeningSceneSection`을 사용하는 빌더 호출 시 `openingScene`을 전달하면 반환된 시스템 프롬프트에 새 지시문이 포함되는지 확인하는 테스트 추가.
- 기존 테스트는 `openingScene` 미전달 케이스이므로 영향 없이 통과해야 함.

## 비목표 (Out of Scope)

- `openingScene` 계산 로직(`chat/route.ts`, `regenerate/route.ts`) 변경 없음.
- ZETA 다중 캐릭터 오프닝 dedup 로직(`app/api/conversations/route.ts:130-152`) 변경 없음 — 별도 이슈로 취급.
