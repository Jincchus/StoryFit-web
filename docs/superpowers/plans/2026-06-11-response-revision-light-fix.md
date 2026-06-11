# AI 응답 재작성 최소화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `needsResponseRevision`의 "350자 미만" / "선택지 비허용 모드인데 선택지 패턴 포함" 트리거를 제거하고, 후자는 `applyLightFixes`로 가벼운 텍스트 후처리만 적용해 불필요한 2차 `streamChat` 재생성을 줄인다.

**Architecture:** `lib/responseControl.ts`에 `stripChoiceArtifacts`, `applyLightFixes` 추가하고 `needsResponseRevision`에서 두 트리거를 제거. `app/api/conversations/[id]/chat/route.ts`에서 1차 응답 정제 직후 `applyLightFixes`를 호출.

**Tech Stack:** TypeScript, Vitest

---

## 참고: 스펙

`apps/web/docs/superpowers/specs/2026-06-11-response-revision-light-fix-design.md`

## 참고: 현재 코드

`apps/web/lib/responseControl.ts:36-43, 62-72, 100-128`:
```ts
const CHOICE_PATTERNS = [
  /어떻게\s*(?:하시|할|하)\s*(?:겠습니까|까요|건가요|\?)/,
  /무엇을\s*(?:하시|할)\s*(?:겠습니까|까요|건가요|\?)/,
  /선택(?:해|하여)\s*주/,
  /골라\s*주/,
  /다음\s*중\s*(?:하나|선택)/,
  /(?:^|\n)\s*(?:1|①)[\).\s]/,
]
...
const SEP_RE = /\n(-{3,}|\*{3,}|={3,})\s*\n/

function getChoiceBlock(text: string): string {
  const parts = text.split(SEP_RE)
  return parts.length >= 3 ? parts[parts.length - 1] : ''
}

function getBodyBlock(text: string): string {
  return text.split(SEP_RE)[0] ?? text
}
...
export function needsResponseRevision(text: string, options: boolean | ResponseRevisionOptions = false): boolean {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const forbiddenChoiceNames = typeof options === 'boolean' ? [] : options.forbiddenChoiceNames ?? []
  const requiredBodyNames = typeof options === 'boolean' ? [] : options.requiredBodyNames ?? []
  const personaName = typeof options === 'boolean' ? undefined : options.personaName

  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length < 350) return true
  if (!allowChoices && CHOICE_PATTERNS.some(pattern => pattern.test(trimmed))) return true
  if (allowChoices && hasForbiddenChoiceSpeaker(trimmed, forbiddenChoiceNames)) return true
  if (allowChoices && missesRequiredBodySpeaker(trimmed, requiredBodyNames)) return true
  if (USER_CONTROL_PATTERNS.some(pattern => pattern.test(trimmed))) return true

  if (personaName) {
    const escapedPersona = escapeRegExp(personaName)
    const bodyBlock = getBodyBlock(trimmed)

    const personaDialoguePattern = new RegExp(`(?:^|\\n)\\s*${escapedPersona}\\s*:`, 'u')
    if (personaDialoguePattern.test(bodyBlock)) return true

    const personaActionPattern = new RegExp(`${escapedPersona}(?:은|는|이|가)?\\s+[^.?!\\n]*(?:했다|하였다|말했다|느꼈다|생각했다|결심했다|고개를|손을|걸음을)`, 'u')
    if (personaActionPattern.test(bodyBlock)) return true
  }

  return false
}
```

`apps/web/app/api/conversations/[id]/chat/route.ts:286-306`:
```ts
    let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(fullText), prevAssistantText)

    const revisionOptions = {
      allowChoices: conv.mode === 'story',
      forbiddenChoiceNames: conv.mode === 'story' ? [character.name] : [],
      requiredBodyNames: conv.mode === 'story' ? [character.name] : [],
      personaName: conv.personaCharacter?.name || conv.user?.displayName || '나',
    }

    if (needsResponseRevision(cleanText, revisionOptions)) {
      const revised = await regenerateControlledResponse({
        conv,
        systemPrompt,
        history,
        firstDraft: cleanText,
        character,
        revisionOptions,
        signal: bgAbort.signal,
      }).catch(() => '')
      if (revised.trim()) cleanText = deduplicatePreviousContent(stripAnalysisPreamble(revised), prevAssistantText)
    }
```

---

## Task 1: `responseControl.ts`에 `stripChoiceArtifacts` / `applyLightFixes` 추가, `needsResponseRevision` 트리거 정리

**Files:**
- Modify: `apps/web/lib/responseControl.ts`
- Create: `apps/web/lib/responseControl.test.ts`
- Modify: `apps/web/app/api/conversations/[id]/chat/route.ts:286-306`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/lib/responseControl.test.ts` (신규 파일) 전체 내용:

```ts
import { describe, it, expect } from 'vitest'
import { needsResponseRevision, stripChoiceArtifacts, applyLightFixes } from './responseControl'

describe('needsResponseRevision', () => {
  it('350자 미만이고 다른 위반이 없으면 재작성하지 않는다', () => {
    expect(needsResponseRevision('짧은 응답이지만 정상이다.', { allowChoices: false })).toBe(false)
  })

  it('allowChoices=false인데 선택지 패턴이 있어도 재작성하지 않는다 (light fix 대상)', () => {
    const text = '철수가 문을 열었다.\n\n어떻게 하시겠습니까?'
    expect(needsResponseRevision(text, { allowChoices: false })).toBe(false)
  })

  it('allowChoices=true인데 선택지 블록에 금지된 이름이 있으면 재작성한다', () => {
    const text = `철수가 문을 열었다.\n---\n1. 영수: 들어간다\n2. 그냥 돌아간다`
    expect(needsResponseRevision(text, { allowChoices: true, forbiddenChoiceNames: ['영수'] })).toBe(true)
  })

  it('allowChoices=true인데 본문에 필수 인물 대사가 없으면 재작성한다', () => {
    const text = `아무 일도 일어나지 않았다.\n---\n1. 행동 A\n2. 행동 B`
    expect(needsResponseRevision(text, { allowChoices: true, requiredBodyNames: ['영수'] })).toBe(true)
  })

  it('유저 페르소나의 행동을 임의로 서술하면 재작성한다', () => {
    const text = '당신은 깊은 한숨을 쉬며 고개를 떨궜다. 그리고 한참을 그렇게 서 있었다가 천천히 자리에서 일어났다.'
    expect(needsResponseRevision(text, { allowChoices: false })).toBe(true)
  })
})

describe('stripChoiceArtifacts', () => {
  it('구분선이 있으면 선택지 블록을 제거하고 본문만 남긴다', () => {
    const text = '철수가 문을 열었다.\n---\n1. 들어간다\n2. 돌아간다'
    expect(stripChoiceArtifacts(text)).toBe('철수가 문을 열었다.')
  })

  it('구분선이 없으면 끝의 선택지/질문 줄만 제거한다', () => {
    const text = '철수가 문을 열었다.\n\n어떻게 하시겠습니까?'
    expect(stripChoiceArtifacts(text)).toBe('철수가 문을 열었다.')
  })

  it('선택지 패턴이 없으면 그대로 둔다', () => {
    const text = '철수가 문을 열고 들어갔다.'
    expect(stripChoiceArtifacts(text)).toBe('철수가 문을 열고 들어갔다.')
  })
})

describe('applyLightFixes', () => {
  it('allowChoices=false면 선택지 흔적을 제거한다', () => {
    const text = '철수가 문을 열었다.\n---\n1. 들어간다\n2. 돌아간다'
    expect(applyLightFixes(text, { allowChoices: false })).toBe('철수가 문을 열었다.')
  })

  it('allowChoices=true면 그대로 둔다', () => {
    const text = '철수가 문을 열었다.\n---\n1. 들어간다\n2. 돌아간다'
    expect(applyLightFixes(text, { allowChoices: true })).toBe(text)
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd apps/web && npx vitest run lib/responseControl.test.ts`
Expected: FAIL (`stripChoiceArtifacts`, `applyLightFixes` not exported / 일부 케이스에서 기존 동작과 불일치)

- [ ] **Step 3: `responseControl.ts` 수정**

`apps/web/lib/responseControl.ts`의 `needsResponseRevision` 함수(100-128번째 줄)를 다음으로 교체:

```ts
export function needsResponseRevision(text: string, options: boolean | ResponseRevisionOptions = false): boolean {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const forbiddenChoiceNames = typeof options === 'boolean' ? [] : options.forbiddenChoiceNames ?? []
  const requiredBodyNames = typeof options === 'boolean' ? [] : options.requiredBodyNames ?? []
  const personaName = typeof options === 'boolean' ? undefined : options.personaName

  const trimmed = text.trim()
  if (!trimmed) return false
  if (allowChoices && hasForbiddenChoiceSpeaker(trimmed, forbiddenChoiceNames)) return true
  if (allowChoices && missesRequiredBodySpeaker(trimmed, requiredBodyNames)) return true
  if (USER_CONTROL_PATTERNS.some(pattern => pattern.test(trimmed))) return true

  if (personaName) {
    const escapedPersona = escapeRegExp(personaName)
    const bodyBlock = getBodyBlock(trimmed)

    const personaDialoguePattern = new RegExp(`(?:^|\\n)\\s*${escapedPersona}\\s*:`, 'u')
    if (personaDialoguePattern.test(bodyBlock)) return true

    const personaActionPattern = new RegExp(`${escapedPersona}(?:은|는|이|가)?\\s+[^.?!\\n]*(?:했다|하였다|말했다|느꼈다|생각했다|결심했다|고개를|손을|걸음을)`, 'u')
    if (personaActionPattern.test(bodyBlock)) return true
  }

  return false
}
```

같은 파일에 `needsResponseRevision` 함수 바로 앞에 다음 두 함수를 추가:

```ts
export function stripChoiceArtifacts(text: string): string {
  const trimmed = text.trim()
  const parts = trimmed.split(SEP_RE)
  if (parts.length >= 3) {
    return parts[0].trim()
  }

  const lines = trimmed.split('\n')
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim()
    if (!last) {
      lines.pop()
      continue
    }
    if (CHOICE_PATTERNS.some(pattern => pattern.test(last))) {
      lines.pop()
      continue
    }
    break
  }
  return lines.join('\n').trim()
}

export function applyLightFixes(text: string, options: boolean | ResponseRevisionOptions = false): string {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const trimmed = text.trim()
  if (!allowChoices && CHOICE_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return stripChoiceArtifacts(trimmed)
  }
  return trimmed
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd apps/web && npx vitest run lib/responseControl.test.ts`
Expected: PASS (8개 테스트 모두 통과)

- [ ] **Step 5: `chat/route.ts`에 `applyLightFixes` 적용**

`apps/web/app/api/conversations/[id]/chat/route.ts`에서 import 구문 수정:

```ts
import { appendTurnControlInstruction, applyLightFixes, buildRevisionPrompt, needsResponseRevision } from '@/lib/responseControl'
```

`apps/web/app/api/conversations/[id]/chat/route.ts:286`의 다음 줄:

```ts
    let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(fullText), prevAssistantText)
```

바로 아래(287번째 줄, `revisionOptions` 선언 앞)에 한 줄 추가:

```ts
    let cleanText = deduplicatePreviousContent(stripAnalysisPreamble(fullText), prevAssistantText)

    const revisionOptions = {
      allowChoices: conv.mode === 'story',
      forbiddenChoiceNames: conv.mode === 'story' ? [character.name] : [],
      requiredBodyNames: conv.mode === 'story' ? [character.name] : [],
      personaName: conv.personaCharacter?.name || conv.user?.displayName || '나',
    }

    cleanText = applyLightFixes(cleanText, revisionOptions)

    if (needsResponseRevision(cleanText, revisionOptions)) {
```

(즉 `revisionOptions` 선언 이후, 기존 `if (needsResponseRevision(...))` 직전에 `cleanText = applyLightFixes(cleanText, revisionOptions)` 한 줄만 추가)

- [ ] **Step 6: 전체 테스트 + 타입체크**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit`
Expected: PASS, 에러 없음

- [ ] **Step 7: 커밋**

```bash
cd apps/web && git add lib/responseControl.ts lib/responseControl.test.ts app/api/conversations/[id]/chat/route.ts && git commit -m "Fix: AI 응답 재작성 트리거 완화 - 짧은 응답/선택지 흔적은 후처리로 처리"
```

- [ ] **Step 8: apps/web을 main에 푸시**

```bash
cd apps/web && git push origin main
```

- [ ] **Step 9: 부모 저장소 서브모듈 포인터 업데이트 + 푸시**

저장소 루트(`/c/StoryFit`)에서:

```bash
git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (AI 응답 재작성 트리거 완화)" && git push origin master
```

---

## Self-Review 체크리스트 (참고용 — 구현자는 무시)

- 스펙의 "350자 미만 트리거 제거" → Step 3 (`needsResponseRevision`에서 해당 라인 삭제)
- 스펙의 "선택지 흔적 후처리" → Step 3 (`stripChoiceArtifacts`, `applyLightFixes`), Step 5 (호출 추가)
- 스펙의 "조건 3~6 유지" → Step 3에서 그대로 보존
- 스펙의 비목표(regenerateControlledResponse, buildRevisionPrompt 변경 없음) → 이 플랜에서 다루지 않음
