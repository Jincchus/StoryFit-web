# user/persona 플레이스홀더 매핑 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Guest"/"User"/"당신"/"페르소나" 등 다양한 표기의 유저 플레이스홀더가 클라이언트 카드(WHIF/ZETA/MELTING/대화화면)와 서버(시스템 프롬프트/채팅)에서 동일한 패턴으로 페르소나 이름으로 치환되도록 통일하고, personaName 기본값 폴백을 `'나'`로 일치시킨다.

**Architecture:** `lib/systemPrompt.ts`의 `replacePlaceholders`에 있던 플레이스홀더 패턴 치환 체인을 `lib/josa.ts`의 신규 `applyPersonaPlaceholders` 함수로 추출해 공유한다. `replacePlaceholders`(서버)와 `replaceDisplayPlaceholders`(클라이언트)는 각각 `applyPersonaPlaceholders` + `fixJosa`를 호출하는 얇은 래퍼가 된다. 동작 차이가 없는 순수 리팩터이므로 기존 75개 테스트는 그대로 통과해야 하며, `replaceDisplayPlaceholders`에만 새 패턴(Guest/User/당신/페르소나 등)이 추가로 적용된다.

**Tech Stack:** TypeScript, Vitest

---

## 참고: 스펙

`apps/web/docs/superpowers/specs/2026-06-11-persona-placeholder-mapping-design.md`

## 참고: 현재 코드

`apps/web/lib/josa.ts` (전체, 51줄):
```ts
type JosaPair = '은/는' | '이/가' | '을/를' | '와/과' | '로/으로' | '(이)라' | '(이)나' | '(이)며'

function getJosa(word: string, pair: JosaPair): string {
  const lastChar = word.trim().slice(-1)
  const code = lastChar.charCodeAt(0) - 0xac00
  const isHangulSyllable = code >= 0 && code <= 11171
  const jong = isHangulSyllable ? code % 28 : 0
  const hasFinal = isHangulSyllable && jong !== 0

  switch (pair) {
    case '은/는': return hasFinal ? '은' : '는'
    case '이/가': return hasFinal ? '이' : '가'
    case '을/를': return hasFinal ? '을' : '를'
    case '와/과': return hasFinal ? '과' : '와'
    case '로/으로': return (!hasFinal || jong === 8) ? '로' : '으로'
    case '(이)라': return hasFinal ? '이라' : '라'
    case '(이)나': return hasFinal ? '이나' : '나'
    case '(이)며': return hasFinal ? '이며' : '며'
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function fixJosa(text: string, names: (string | undefined | null)[]): string {
  let result = text
  for (const name of names) {
    if (!name) continue
    const escaped = escapeRegExp(name)

    result = result.replace(new RegExp(`${escaped}(이라|라)`, 'g'), `${name}${getJosa(name, '(이)라')}`)
    result = result.replace(new RegExp(`${escaped}(이나|나)`, 'g'), `${name}${getJosa(name, '(이)나')}`)
    result = result.replace(new RegExp(`${escaped}(이며|며)`, 'g'), `${name}${getJosa(name, '(이)며')}`)

    result = result.replace(new RegExp(`${escaped}(으로|로)`, 'g'), `${name}${getJosa(name, '로/으로')}`)

    result = result.replace(new RegExp(`${escaped}(은|는)`, 'g'), `${name}${getJosa(name, '은/는')}`)
    result = result.replace(new RegExp(`${escaped}(이|가)`, 'g'), `${name}${getJosa(name, '이/가')}`)
    result = result.replace(new RegExp(`${escaped}(을|를)`, 'g'), `${name}${getJosa(name, '을/를')}`)
    result = result.replace(new RegExp(`${escaped}(와|과)`, 'g'), `${name}${getJosa(name, '와/과')}`)
  }
  return result
}

export function replaceDisplayPlaceholders(text: string, userName: string, charName?: string): string {
  let result = text.replace(/\{\{user\}\}/gi, userName)
  if (charName) result = result.replace(/\{\{char\}\}/gi, charName)
  return fixJosa(result, [userName, charName])
}
```

`apps/web/lib/systemPrompt.ts:1-2, 110-131`:
```ts
import type { Character, LorebookEntry, StyleConfig } from '@/types'
import { fixJosa } from './josa'

// ... (생략) ...

export function replacePlaceholders(text: string, personaName: string, charName?: string): string {
  let result = text
  if (charName) {
    result = result
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/\{char\}/gi, charName)
      .replace(/\{캐릭터\}/g, charName)
  }
  result = result
    .replace(/\{\{user\}\}/gi, personaName)
    .replace(/\{user\}/gi, personaName)
    .replace(/\{유저\}/g, personaName)
    .replace(/\[유저\]/g, personaName)
    .replace(/\[USER\]/gi, personaName)
    .replace(/\bguest\b/gi, personaName)
    .replace(/\bpersona\b/gi, personaName)
    .replace(/\b페르소나\b/g, personaName)
    .replace(/\b주인공\b/g, personaName)
    .replace(/\buser\b/gi, personaName)
    .replace(/\b당신\b/g, personaName)
  return fixJosa(result, [personaName, charName])
}
```

`apps/web/app/api/conversations/[id]/chat/route.ts:288-293`:
```ts
    const revisionOptions = {
      allowChoices: conv.mode === 'story',
      forbiddenChoiceNames: conv.mode === 'story' ? [character.name] : [],
      requiredBodyNames: conv.mode === 'story' ? [character.name] : [],
      personaName: conv.personaCharacter?.name || conv.user?.displayName || '유저',
    }
```

---

## Task 1: `lib/josa.ts` — `applyPersonaPlaceholders` 추출 + `replaceDisplayPlaceholders` 갱신

**Files:**
- Modify: `apps/web/lib/josa.ts`
- Test: `apps/web/lib/josa.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/lib/josa.test.ts` 맨 위 import를 다음과 같이 바꾸고:

```ts
import { describe, it, expect } from 'vitest'
import { fixJosa, applyPersonaPlaceholders, replaceDisplayPlaceholders } from './josa'
```

파일 끝(`replaceDisplayPlaceholders` describe 블록 뒤)에 다음 두 describe 블록을 추가한다:

```ts
describe('applyPersonaPlaceholders', () => {
  it('{{user}}/{{char}}/{user}/{char}/{유저}/{캐릭터}/[유저]/[USER]를 치환한다', () => {
    expect(applyPersonaPlaceholders('{{user}}와 {{char}}', '민준', '철수')).toBe('민준와 철수')
    expect(applyPersonaPlaceholders('{user}와 {char}', '민준', '철수')).toBe('민준와 철수')
    expect(applyPersonaPlaceholders('{유저}와 {캐릭터}', '민준', '철수')).toBe('민준와 철수')
    expect(applyPersonaPlaceholders('[유저]와 [USER]', '민준')).toBe('민준와 민준')
  })

  it('Guest/User를 대소문자 무관하게 치환한다', () => {
    expect(applyPersonaPlaceholders('Guest와 User와 GUEST와 guest', '민준')).toBe('민준와 민준와 민준와 민준')
  })

  it('persona/페르소나/주인공/당신을 치환한다', () => {
    expect(applyPersonaPlaceholders('persona와 페르소나와 주인공과 당신', '민준')).toBe('민준와 민준와 민준과 민준')
  })

  it('charName이 없으면 {{char}} 패턴은 치환하지 않는다', () => {
    expect(applyPersonaPlaceholders('{{user}}와 {{char}}', '민준')).toBe('민준와 {{char}}')
  })
})

describe('replaceDisplayPlaceholders - 확장 패턴', () => {
  it('Guest/User 표기를 페르소나 이름으로 치환하고 조사를 교정한다', () => {
    expect(replaceDisplayPlaceholders('Guest는 학교에 갔다', '민준')).toBe('민준은 학교에 갔다')
    expect(replaceDisplayPlaceholders('User는 학교에 갔다', '민준')).toBe('민준은 학교에 갔다')
  })

  it('당신/페르소나 표기를 페르소나 이름으로 치환하고 조사를 교정한다', () => {
    expect(replaceDisplayPlaceholders('당신은 누구인가', '철수')).toBe('철수는 누구인가')
    expect(replaceDisplayPlaceholders('페르소나가 왔다', '철수')).toBe('철수가 왔다')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/web && npx vitest run lib/josa.test.ts`
Expected: FAIL — `applyPersonaPlaceholders` is not exported / not defined, 신규 `replaceDisplayPlaceholders - 확장 패턴` 테스트도 실패.

- [ ] **Step 3: `applyPersonaPlaceholders` 구현 + `replaceDisplayPlaceholders` 갱신**

`apps/web/lib/josa.ts`의 마지막 함수(`replaceDisplayPlaceholders`, 46-50줄)를 다음으로 교체한다:

```ts
export function applyPersonaPlaceholders(text: string, personaName: string, charName?: string): string {
  let result = text
  if (charName) {
    result = result
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/\{char\}/gi, charName)
      .replace(/\{캐릭터\}/g, charName)
  }
  return result
    .replace(/\{\{user\}\}/gi, personaName)
    .replace(/\{user\}/gi, personaName)
    .replace(/\{유저\}/g, personaName)
    .replace(/\[유저\]/g, personaName)
    .replace(/\[USER\]/gi, personaName)
    .replace(/\bguest\b/gi, personaName)
    .replace(/\bpersona\b/gi, personaName)
    .replace(/\b페르소나\b/g, personaName)
    .replace(/\b주인공\b/g, personaName)
    .replace(/\buser\b/gi, personaName)
    .replace(/\b당신\b/g, personaName)
}

export function replaceDisplayPlaceholders(text: string, userName: string, charName?: string): string {
  return fixJosa(applyPersonaPlaceholders(text, userName, charName), [userName, charName])
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/web && npx vitest run lib/josa.test.ts`
Expected: PASS (모든 테스트 통과)

- [ ] **Step 5: 커밋**

```bash
cd apps/web && git add lib/josa.ts lib/josa.test.ts && git commit -m "Refactor: applyPersonaPlaceholders 추출 및 replaceDisplayPlaceholders에 Guest/User/당신 등 패턴 적용"
```

---

## Task 2: `lib/systemPrompt.ts` — `replacePlaceholders`를 `applyPersonaPlaceholders` 기반으로 단순화

**Files:**
- Modify: `apps/web/lib/systemPrompt.ts:2, 110-131`
- Test: `apps/web/lib/systemPrompt.test.ts` (회귀 확인용, 신규 테스트 없음)

- [ ] **Step 1: 회귀 테스트로 현재 동작 확인 (베이스라인)**

Run: `cd apps/web && npx vitest run lib/systemPrompt.test.ts`
Expected: PASS (기존 2개 테스트 통과 — 리팩터 전 베이스라인 확인)

- [ ] **Step 2: import 수정**

`apps/web/lib/systemPrompt.ts:2`를 다음으로 교체한다:

```ts
import { fixJosa, applyPersonaPlaceholders } from './josa'
```

- [ ] **Step 3: `replacePlaceholders` 본문 단순화**

`apps/web/lib/systemPrompt.ts:110-131`의 `replacePlaceholders` 전체를 다음으로 교체한다:

```ts
export function replacePlaceholders(text: string, personaName: string, charName?: string): string {
  return fixJosa(applyPersonaPlaceholders(text, personaName, charName), [personaName, charName])
}
```

- [ ] **Step 4: 회귀 테스트 통과 확인**

Run: `cd apps/web && npx vitest run lib/systemPrompt.test.ts lib/josa.test.ts`
Expected: PASS (기존 동작과 동일하므로 모두 통과해야 함)

- [ ] **Step 5: 커밋**

```bash
cd apps/web && git add lib/systemPrompt.ts && git commit -m "Refactor: replacePlaceholders가 applyPersonaPlaceholders 공유 함수를 사용하도록 단순화"
```

---

## Task 3: personaName 폴백 통일 + 전체 검증 + 배포

**Files:**
- Modify: `apps/web/app/api/conversations/[id]/chat/route.ts:292`

- [ ] **Step 1: 폴백 값 수정**

`apps/web/app/api/conversations/[id]/chat/route.ts:292`에서:

```ts
      personaName: conv.personaCharacter?.name || conv.user?.displayName || '유저',
```

를 다음으로 교체한다 (같은 파일 145번 줄 `const personaName = conv.personaCharacter?.name || conv.user?.displayName || '나'`와 동일한 폴백으로 통일):

```ts
      personaName: conv.personaCharacter?.name || conv.user?.displayName || '나',
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음 (출력 없음)

- [ ] **Step 3: 전체 테스트 실행**

Run: `cd apps/web && npx vitest run`
Expected: PASS (기존 75개 + Task 1에서 추가한 신규 테스트 모두 통과)

- [ ] **Step 4: 커밋**

```bash
cd apps/web && git add app/api/conversations/[id]/chat/route.ts && git commit -m "Fix: chat route의 personaName 폴백을 '나'로 통일"
```

- [ ] **Step 5: apps/web을 main에 푸시**

```bash
cd apps/web && git push origin main
```

- [ ] **Step 6: 부모 저장소 서브모듈 포인터 업데이트 + 푸시**

저장소 루트(`/c/StoryFit`)에서:

```bash
git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (user/persona 플레이스홀더 매핑 통일)" && git push origin master
```

---

## Self-Review 체크리스트 (참고용 — 구현자는 무시)

- 스펙 1번(`applyPersonaPlaceholders` 신설) → Task 1
- 스펙 2번(`replacePlaceholders` 단순화) → Task 2
- 스펙 3번(personaName 폴백 통일) → Task 3
- 스펙 4번(테스트) → Task 1 (신규 케이스), Task 2/3 (회귀 확인)
- `normalizeGuest` 변경 없음 (스펙 비목표) — 이 플랜에서 다루지 않음
