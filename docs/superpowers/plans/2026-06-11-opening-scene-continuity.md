# 오프닝 장면 연속성 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시스템 프롬프트의 `[오프닝 장면 — 대화의 시작]` 섹션에, 오프닝 장면이 "현재 진행 중인 상황"이며 첫 응답이 그 감정/갈등/분위기를 그대로 이어받아야 한다는 지시문을 추가하여, AI가 오프닝 직후 유저 메시지에 대해 맥락을 무시한 응답을 하는 빈도를 줄인다.

**Architecture:** `lib/systemPrompt.ts`의 `buildOpeningSceneSection(openingScene)` 함수가 반환하는 문자열에 연속성 지시문을 추가한다. 이 함수는 `buildSystemPrompt`, `buildNovelSystemPrompt`, `buildStorySystemPrompt`, `buildMultiStorySystemPrompt` 4개 빌더가 공통으로 호출하므로, 함수 내부 1곳만 수정하면 4개 모드 전체에 자동 적용된다. 함수 시그니처와 호출부는 변경하지 않는다.

**Tech Stack:** TypeScript, Vitest

---

## 참고: 스펙

`apps/web/docs/superpowers/specs/2026-06-11-opening-scene-continuity-design.md`

## 참고: 현재 코드

`apps/web/lib/systemPrompt.ts:127-131`:
```ts
// 대화 도입부(오프닝)는 토큰 예산에 따라 최근 메시지 목록에서 잘려나갈 수 있다.
// 이 경우에도 AI가 최초 장면 설정을 계속 인지하도록 시스템 프롬프트에 별도로 고정한다.
function buildOpeningSceneSection(openingScene?: string): string {
  return openingScene?.trim() ? `[오프닝 장면 — 대화의 시작]\n${openingScene.trim()}` : ''
}
```

`apps/web/lib/systemPrompt.test.ts` (전체, 13줄):
```ts
import { describe, it, expect } from 'vitest'
import { replacePlaceholders } from './systemPrompt'

describe('replacePlaceholders', () => {
  it('치환 후 잘못된 조사를 교정한다', () => {
    expect(replacePlaceholders('{{user}}는 {{char}}이 좋다고 말했다', '민준', '철수')).toBe('민준은 철수가 좋다고 말했다')
  })

  it('기존 치환 패턴(guest, persona 등)도 그대로 동작하며 멱등이다', () => {
    expect(replacePlaceholders('guest는 persona를 만났다', '영수')).toBe('영수는 영수를 만났다')
  })
})
```

`apps/web/types/index.ts:23-44`의 `Character` 인터페이스 (테스트용 캐릭터 객체 작성 시 참고):
```ts
export interface Character {
  id: string
  kind?: AvatarKind
  name: string
  gender?: string
  avatarUrl?: string
  tags: string[]
  additionalInfo: string
  exampleDialogues: string
  openingMessage?: string
  safetyLevel: SafetyLevel
  temperature: number
  frequencyPenalty: number
  maxOutputTokens?: number
  thinkingBudget?: number
  isPreset: boolean
  isAutoCreated?: boolean
  collection?: CharacterCollection | null
  completed?: boolean
  hasArchived?: boolean
  rooms?: { id: string; title: string }[]
}
```

`buildSystemPrompt`는 `BuildSystemPromptParams`를 받으며 필수 필드는 `character`뿐이다 (다른 필드는 모두 optional, `lib/systemPrompt.ts:53-69` 참고).

---

## Task 1: `buildOpeningSceneSection`에 연속성 지시문 추가 + 테스트

**Files:**
- Modify: `apps/web/lib/systemPrompt.ts:127-131`
- Test: `apps/web/lib/systemPrompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/lib/systemPrompt.test.ts` 맨 위 import를 다음으로 바꾼다:

```ts
import { describe, it, expect } from 'vitest'
import { replacePlaceholders, buildSystemPrompt } from './systemPrompt'
import type { Character } from '@/types'
```

파일 끝(기존 `describe('replacePlaceholders', ...)` 블록 뒤)에 다음 describe 블록을 추가한다:

```ts
describe('buildOpeningSceneSection (buildSystemPrompt 경유)', () => {
  const baseCharacter: Character = {
    id: 'char-1',
    name: '철수',
    tags: [],
    additionalInfo: '',
    exampleDialogues: '',
    safetyLevel: 'standard',
    temperature: 0.9,
    frequencyPenalty: 0.3,
    isPreset: false,
  }

  it('openingScene이 있으면 연속성 지시문과 함께 [오프닝 장면] 섹션을 포함한다', () => {
    const prompt = buildSystemPrompt({
      character: baseCharacter,
      openingScene: '철수와 영수가 말다툼을 벌이고 있다.',
    })

    expect(prompt).toContain('[오프닝 장면 — 대화의 시작]')
    expect(prompt).toContain('철수와 영수가 말다툼을 벌이고 있다.')
    expect(prompt).toContain('현재 진행 중인 상황')
    expect(prompt).toContain('이어받아')
  })

  it('openingScene이 없으면 [오프닝 장면] 섹션이 포함되지 않는다', () => {
    const prompt = buildSystemPrompt({ character: baseCharacter })

    expect(prompt).not.toContain('[오프닝 장면 — 대화의 시작]')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/web && npx vitest run lib/systemPrompt.test.ts`
Expected: FAIL — 첫 번째 신규 테스트가 `현재 진행 중인 상황`/`이어받아` 문자열을 찾지 못해 실패 (현재 `buildOpeningSceneSection`은 오프닝 내용만 그대로 반환하므로).

- [ ] **Step 3: `buildOpeningSceneSection` 구현 수정**

`apps/web/lib/systemPrompt.ts:129-131`을 다음으로 교체한다:

```ts
function buildOpeningSceneSection(openingScene?: string): string {
  return openingScene?.trim()
    ? `[오프닝 장면 — 대화의 시작]\n${openingScene.trim()}\n\n위 오프닝 장면은 대화가 시작되기 직전에 일어난 일이며, 현재 진행 중인 상황입니다. 첫 응답은 이 장면에서 형성된 감정, 갈등, 분위기, 상황을 그대로 이어받아 자연스럽게 진행해야 합니다. 장면을 리셋하거나, 오프닝과 무관한 반응을 하거나, 갈등/감정 상태를 임의로 해소하지 마세요.`
    : ''
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/web && npx vitest run lib/systemPrompt.test.ts`
Expected: PASS (4개 테스트 모두 통과)

- [ ] **Step 5: 전체 테스트 + 타입 체크**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과 (기존 81개 + 신규 2개 = 83개)

- [ ] **Step 6: 커밋**

```bash
cd apps/web && git add lib/systemPrompt.ts lib/systemPrompt.test.ts && git commit -m "Feat: 오프닝 장면 섹션에 연속성 유지 지시문 추가"
```

- [ ] **Step 7: apps/web을 main에 푸시**

```bash
cd apps/web && git push origin main
```

- [ ] **Step 8: 부모 저장소 서브모듈 포인터 업데이트 + 푸시**

저장소 루트(`/c/StoryFit`)에서:

```bash
git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (오프닝 장면 연속성 강화)" && git push origin master
```

---

## Self-Review 체크리스트 (참고용 — 구현자는 무시)

- 스펙의 "변경 사항"(buildOpeningSceneSection 수정) → Task 1 Step 3
- 스펙의 "테스트" 요구사항 → Task 1 Step 1 (openingScene 있음/없음 두 케이스)
- 스펙의 "영향 범위"(4개 빌더 자동 적용, openingScene 없을 때 동작 동일) → Task 1 Step 1의 두 번째 테스트로 회귀 확인
- 스펙의 비목표(openingScene 계산 로직, dedup 로직 변경 없음) → 이 플랜에서 다루지 않음
