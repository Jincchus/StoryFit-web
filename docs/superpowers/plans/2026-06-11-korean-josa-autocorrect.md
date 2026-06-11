# 한국어 조사 자동 교정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `{{user}}`/`{{char}}` 등 플레이스홀더를 실제 이름으로 치환할 때, 뒤따르는 한국어 조사(은/는, 이/가, 을/를, 와/과, 로/으로, (이)라, (이)나, (이)며)를 이름의 받침 유무에 맞게 자동 교정한다. 채팅창, 캐릭터 카드(WHIF/ZETA/MELTING), 캐릭터 설정 텍스트 모두 동일한 로직을 사용한다.

**Architecture:** `lib/josa.ts`에 순수 함수 `getJosa`/`fixJosa`/`replaceDisplayPlaceholders`를 신규 작성한다. 서버 측 `lib/systemPrompt.ts`의 `replacePlaceholders`는 기존 치환 체인 끝에 `fixJosa`를 추가 호출한다(8개 호출부 자동 적용). 클라이언트 13개 호출부는 `.replace({{user}}).replace({{char}})` 체인을 `replaceDisplayPlaceholders`로 교체한다(MELTING 2곳은 `{유저}`/`{캐릭터}` 추가 치환이 있어 `fixJosa`를 직접 사용).

**Tech Stack:** TypeScript, Next.js 14, Vitest (`vitest run`)

---

## Task 1: `lib/josa.ts` 핵심 로직 + 테스트 (TDD)

**Files:**
- Create: `apps/web/lib/josa.ts`
- Test: `apps/web/lib/josa.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/lib/josa.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { fixJosa, replaceDisplayPlaceholders } from './josa'

describe('fixJosa', () => {
  it('받침 있는 이름 뒤 잘못된 은/는을 은으로 교정한다', () => {
    expect(fixJosa('민준는 학교에 갔다', ['민준'])).toBe('민준은 학교에 갔다')
  })

  it('받침 없는 이름 뒤 잘못된 은/는을 는으로 교정한다', () => {
    expect(fixJosa('철수은 학교에 갔다', ['철수'])).toBe('철수는 학교에 갔다')
  })

  it('받침 있는 이름 뒤 이/가를 이로 교정한다', () => {
    expect(fixJosa('민준가 왔다', ['민준'])).toBe('민준이 왔다')
  })

  it('받침 없는 이름 뒤 이/가를 가로 교정한다', () => {
    expect(fixJosa('철수이 왔다', ['철수'])).toBe('철수가 왔다')
  })

  it('받침 있는 이름 뒤 을/를을 을로 교정한다', () => {
    expect(fixJosa('민준를 불렀다', ['민준'])).toBe('민준을 불렀다')
  })

  it('받침 없는 이름 뒤 을/를을 를로 교정한다', () => {
    expect(fixJosa('철수을 불렀다', ['철수'])).toBe('철수를 불렀다')
  })

  it('받침 있는 이름 뒤 와/과를 과로 교정한다', () => {
    expect(fixJosa('민준와 함께', ['민준'])).toBe('민준과 함께')
  })

  it('받침 없는 이름 뒤 와/과를 와로 교정한다', () => {
    expect(fixJosa('철수과 함께', ['철수'])).toBe('철수와 함께')
  })

  it('받침 없는 이름 뒤 으로/로를 로로 교정한다', () => {
    expect(fixJosa('철수으로 갔다', ['철수'])).toBe('철수로 갔다')
  })

  it('ㄹ받침 이름 뒤 으로/로를 로로 교정한다', () => {
    expect(fixJosa('민철으로 갔다', ['민철'])).toBe('민철로 갔다')
  })

  it('ㄹ이 아닌 받침 이름 뒤 로/으로를 으로로 교정한다', () => {
    expect(fixJosa('민준로 갔다', ['민준'])).toBe('민준으로 갔다')
  })

  it('받침 없는 이름 뒤 (이)라를 라로 교정하며 처리 순서를 보장한다', () => {
    expect(fixJosa('철수이라면 좋겠다', ['철수'])).toBe('철수라면 좋겠다')
  })

  it('받침 있는 이름 뒤 (이)라를 이라로 교정한다', () => {
    expect(fixJosa('민준라면 좋겠다', ['민준'])).toBe('민준이라면 좋겠다')
  })

  it('받침 없는 이름 뒤 (이)나를 나로 교정한다', () => {
    expect(fixJosa('철수이나 갈까', ['철수'])).toBe('철수나 갈까')
  })

  it('받침 있는 이름 뒤 (이)며를 이며로 교정한다', () => {
    expect(fixJosa('민준며 인사했다', ['민준'])).toBe('민준이며 인사했다')
  })

  it('이미 올바른 조사는 그대로 유지한다(멱등)', () => {
    expect(fixJosa('민준은 학교에 갔다', ['민준'])).toBe('민준은 학교에 갔다')
    expect(fixJosa('철수는 학교에 갔다', ['철수'])).toBe('철수는 학교에 갔다')
  })

  it('한글 음절이 아닌 문자로 끝나는 이름은 받침 없음으로 처리한다', () => {
    expect(fixJosa('Tom은 왔다', ['Tom'])).toBe('Tom는 왔다')
  })

  it('null/undefined 이름은 무시한다', () => {
    expect(fixJosa('민준는 학교에 갔다', ['민준', null, undefined])).toBe('민준은 학교에 갔다')
  })

  it('여러 이름을 동시에 교정한다', () => {
    expect(fixJosa('민준는 철수과 만났다', ['민준', '철수'])).toBe('민준은 철수와 만났다')
  })
})

describe('replaceDisplayPlaceholders', () => {
  it('{{user}}와 {{char}}를 치환하고 조사를 교정한다', () => {
    expect(replaceDisplayPlaceholders('{{user}}는 {{char}}이 좋다', '민준', '철수')).toBe('민준은 철수가 좋다')
  })

  it('charName이 없으면 {{char}}는 치환하지 않는다', () => {
    expect(replaceDisplayPlaceholders('{{user}}는 인사했다', '민준')).toBe('민준은 인사했다')
  })
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run (`apps/web` 디렉토리에서): `npx vitest run lib/josa.test.ts`
Expected: FAIL — `Cannot find module './josa'` (또는 유사한 모듈 없음 에러)

- [ ] **Step 3: 최소 구현 작성**

`apps/web/lib/josa.ts` 생성:

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

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run lib/josa.test.ts`
Expected: PASS — 모든 테스트(20개) 통과

- [ ] **Step 5: 커밋**

```bash
git add lib/josa.ts lib/josa.test.ts
git commit -m "Feat: 한국어 조사 자동 교정 핵심 로직 추가"
```

---

## Task 2: 서버 적용 — `lib/systemPrompt.ts`

**Files:**
- Modify: `apps/web/lib/systemPrompt.ts:1`, `apps/web/lib/systemPrompt.ts:108-129`
- Test: `apps/web/lib/systemPrompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/lib/systemPrompt.test.ts` 생성:

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

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run lib/systemPrompt.test.ts`
Expected: FAIL — 첫 번째 테스트는 `'민준는 철수이 좋다고 말했다'`를 반환하여 `'민준은 철수가 좋다고 말했다'`와 불일치

- [ ] **Step 3: `replacePlaceholders`에 `fixJosa` 적용**

`apps/web/lib/systemPrompt.ts:1` 수정:

```ts
import type { Character, LorebookEntry, StyleConfig } from '@/types'
import { fixJosa } from './josa'
```

`apps/web/lib/systemPrompt.ts:108-129`의 다음 코드를:

```ts
// {{user}}, {user}, [유저], user, guest, persona, 페르소나, 주인공, 당신 등 유저 플레이스홀더를 페르소나 이름으로 치환
export function replacePlaceholders(text: string, personaName: string, charName?: string): string {
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
```

다음으로 교체:

```ts
// {{user}}, {user}, [유저], user, guest, persona, 페르소나, 주인공, 당신 등 유저 플레이스홀더를 페르소나 이름으로 치환
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

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run lib/systemPrompt.test.ts`
Expected: PASS — 2개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add lib/systemPrompt.ts lib/systemPrompt.test.ts
git commit -m "Feat: replacePlaceholders에 조사 자동 교정 적용"
```

---

## Task 3: 클라이언트 적용 — WHIF 카드/상세 (3개 파일, 4곳)

**Files:**
- Modify: `apps/web/app/(whif)/whif/page.tsx:4`, `:164-167`
- Modify: `apps/web/app/(whif)/whif/universes/[id]/page.tsx:4`, `:93-96`
- Modify: `apps/web/app/(whif)/whif/characters/[id]/page.tsx:4`, `:147-150`, `:168-171`

- [ ] **Step 1: `app/(whif)/whif/page.tsx` 수정**

`app/(whif)/whif/page.tsx:4` 다음 줄 뒤에 import 추가:

```ts
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
```

`app/(whif)/whif/page.tsx:164-167`의 다음 코드를:

```tsx
                    {c.additionalInfo?.trim() && (
                      <div className="whif-card-desc">{c.additionalInfo
                        .replace(/\{\{user\}\}/gi, '나')
                        .replace(/\{\{char\}\}/gi, c.name)}</div>
                    )}
```

다음으로 교체:

```tsx
                    {c.additionalInfo?.trim() && (
                      <div className="whif-card-desc">{replaceDisplayPlaceholders(c.additionalInfo, '나', c.name)}</div>
                    )}
```

- [ ] **Step 2: `app/(whif)/whif/universes/[id]/page.tsx` 수정**

`app/(whif)/whif/universes/[id]/page.tsx:4` 다음 줄 뒤에 import 추가:

```ts
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
```

`app/(whif)/whif/universes/[id]/page.tsx:93-95`의 다음 코드를:

```tsx
                {uni.description
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, uni.characters?.[0]?.name ?? '')}
```

다음으로 교체:

```tsx
                {replaceDisplayPlaceholders(uni.description, '나', uni.characters?.[0]?.name ?? '')}
```

- [ ] **Step 3: `app/(whif)/whif/characters/[id]/page.tsx` 수정**

`app/(whif)/whif/characters/[id]/page.tsx:4` 다음 줄 뒤에 import 추가:

```ts
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
```

`app/(whif)/whif/characters/[id]/page.tsx:147-149`의 다음 코드를:

```tsx
              <p style={{ color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{char.additionalInfo
                .replace(/\{\{user\}\}/gi, '나')
                .replace(/\{\{char\}\}/gi, char.name)}</p>
```

다음으로 교체:

```tsx
              <p style={{ color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{replaceDisplayPlaceholders(char.additionalInfo, '나', char.name)}</p>
```

이어서 `app/(whif)/whif/characters/[id]/page.tsx:168-170`의 다음 코드를:

```tsx
                <NovelText text={(openings[openingIdx]?.content ?? '')
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, char.name)} />
```

다음으로 교체:

```tsx
                <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', '나', char.name)} />
```

- [ ] **Step 4: 타입 체크**

Run (`apps/web` 디렉토리에서): `npx tsc --noEmit`
Expected: 에러 없음 (종료 코드 0, 약 20초 소요)

- [ ] **Step 5: 커밋**

```bash
git add "app/(whif)/whif/page.tsx" "app/(whif)/whif/universes/[id]/page.tsx" "app/(whif)/whif/characters/[id]/page.tsx"
git commit -m "Refactor: WHIF 카드/상세에 조사 자동 교정 적용"
```

---

## Task 4: 클라이언트 적용 — ZETA 카드/상세 (2개 파일, 5곳)

**Files:**
- Modify: `apps/web/app/(zeta)/zeta/page.tsx:4`, `:131`
- Modify: `apps/web/app/(zeta)/zeta/plots/[id]/page.tsx:4`, `:224-227`, `:240-243`, `:260-263`, `:278-281`

- [ ] **Step 1: `app/(zeta)/zeta/page.tsx` 수정**

`app/(zeta)/zeta/page.tsx:4` 다음 줄 뒤에 import 추가:

```ts
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
```

`app/(zeta)/zeta/page.tsx:131`의 다음 코드를:

```tsx
                        {intro.replace(/\{\{user\}\}/gi, '나').replace(/\{\{char\}\}/gi, mainChar?.name ?? '')}
```

다음으로 교체:

```tsx
                        {replaceDisplayPlaceholders(intro, '나', mainChar?.name ?? '')}
```

- [ ] **Step 2: `app/(zeta)/zeta/plots/[id]/page.tsx` 수정**

`app/(zeta)/zeta/plots/[id]/page.tsx:4` 다음 줄 뒤에 import 추가:

```ts
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
```

`app/(zeta)/zeta/plots/[id]/page.tsx:224-226`의 다음 코드를:

```tsx
                          {c.additionalInfo
                            .replace(/\{\{user\}\}/gi, '나')
                            .replace(/\{\{char\}\}/gi, c.name)}
```

다음으로 교체:

```tsx
                          {replaceDisplayPlaceholders(c.additionalInfo, '나', c.name)}
```

이어서 `app/(zeta)/zeta/plots/[id]/page.tsx:240-242`의 다음 코드를:

```tsx
                <NovelText text={col.description
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
```

다음으로 교체:

```tsx
                <NovelText text={replaceDisplayPlaceholders(col.description ?? '', '나', mainChar?.name ?? '')} />
```

이어서 `app/(zeta)/zeta/plots/[id]/page.tsx:260-262`의 다음 코드를:

```tsx
                <NovelText text={(openings[openingIdx]?.content ?? '')
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
```

다음으로 교체:

```tsx
                <NovelText text={replaceDisplayPlaceholders(openings[openingIdx]?.content ?? '', '나', mainChar?.name ?? '')} />
```

이어서 `app/(zeta)/zeta/plots/[id]/page.tsx:278-280`의 다음 코드를:

```tsx
                        <NovelText text={String(m.content ?? '')
                          .replace(/\{\{user\}\}/gi, '나')
                          .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')} />
```

다음으로 교체:

```tsx
                        <NovelText text={replaceDisplayPlaceholders(String(m.content ?? ''), '나', mainChar?.name ?? '')} />
```

- [ ] **Step 3: 타입 체크**

Run (`apps/web` 디렉토리에서): `npx tsc --noEmit`
Expected: 에러 없음 (종료 코드 0)

- [ ] **Step 4: 커밋**

```bash
git add "app/(zeta)/zeta/page.tsx" "app/(zeta)/zeta/plots/[id]/page.tsx"
git commit -m "Refactor: ZETA 카드/상세에 조사 자동 교정 적용"
```

---

## Task 5: 클라이언트 적용 — MELTING 상세 + 대화 화면 (2개 파일, 4곳)

**Files:**
- Modify: `apps/web/app/(melting)/melting/characters/[id]/page.tsx:4`, `:147-152`, `:159-164`
- Modify: `apps/web/app/(main)/conversations/[id]/page.tsx:4`, `:1024-1028`, `:1296-1298`

MELTING 상세 페이지는 `{유저}`/`{캐릭터}` 추가 치환이 있으므로 `replaceDisplayPlaceholders` 대신 `fixJosa`를 직접 사용한다.

- [ ] **Step 1: `app/(melting)/melting/characters/[id]/page.tsx` 수정**

`app/(melting)/melting/characters/[id]/page.tsx:4` 다음 줄 뒤에 import 추가:

```ts
import { api } from '@/lib/api'
import { fixJosa } from '@/lib/josa'
```

`app/(melting)/melting/characters/[id]/page.tsx:147-151`의 다음 코드를:

```tsx
              <MeltingMarkdown text={mainChar.additionalInfo
                .replace(/\{\{user\}\}/gi, '나')
                .replace(/\{\{char\}\}/gi, mainChar.name)
                .replace(/\{유저\}/g, '나')
                .replace(/\{캐릭터\}/g, mainChar.name)} />
```

다음으로 교체:

```tsx
              <MeltingMarkdown text={fixJosa(mainChar.additionalInfo
                .replace(/\{\{user\}\}/gi, '나')
                .replace(/\{\{char\}\}/gi, mainChar.name)
                .replace(/\{유저\}/g, '나')
                .replace(/\{캐릭터\}/g, mainChar.name), ['나', mainChar.name])} />
```

이어서 `app/(melting)/melting/characters/[id]/page.tsx:159-163`의 다음 코드를:

```tsx
                <NovelText text={opening
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')
                  .replace(/\{유저\}/g, '나')
                  .replace(/\{캐릭터\}/g, mainChar?.name ?? '')} />
```

다음으로 교체:

```tsx
                <NovelText text={fixJosa(opening
                  .replace(/\{\{user\}\}/gi, '나')
                  .replace(/\{\{char\}\}/gi, mainChar?.name ?? '')
                  .replace(/\{유저\}/g, '나')
                  .replace(/\{캐릭터\}/g, mainChar?.name ?? ''), ['나', mainChar?.name])} />
```

- [ ] **Step 2: `app/(main)/conversations/[id]/page.tsx` 수정**

`app/(main)/conversations/[id]/page.tsx:4` 다음 줄 뒤에 import 추가:

```ts
import { api } from '@/lib/api'
import { replaceDisplayPlaceholders } from '@/lib/josa'
```

`app/(main)/conversations/[id]/page.tsx:1024-1028`의 다음 코드를:

```tsx
                const processedContent = !isYou
                  ? m.content
                      .replace(/\{\{user\}\}/gi, conv.personaCharacter?.name ?? '나')
                      .replace(/\{\{char\}\}/gi, msgChar.name)
                  : m.content
```

다음으로 교체:

```tsx
                const processedContent = !isYou
                  ? replaceDisplayPlaceholders(m.content, conv.personaCharacter?.name ?? '나', msgChar.name)
                  : m.content
```

이어서 `app/(main)/conversations/[id]/page.tsx:1296-1298`의 다음 코드를:

```tsx
                            const ps = streaming
                              .replace(/\{\{user\}\}/gi, conv.personaCharacter?.name ?? '나')
                              .replace(/\{\{char\}\}/gi, streamingChar.name)
```

다음으로 교체:

```tsx
                            const ps = replaceDisplayPlaceholders(streaming, conv.personaCharacter?.name ?? '나', streamingChar.name)
```

- [ ] **Step 3: 타입 체크**

Run (`apps/web` 디렉토리에서): `npx tsc --noEmit`
Expected: 에러 없음 (종료 코드 0)

- [ ] **Step 4: 커밋**

```bash
git add "app/(melting)/melting/characters/[id]/page.tsx" "app/(main)/conversations/[id]/page.tsx"
git commit -m "Refactor: MELTING 상세/대화 화면에 조사 자동 교정 적용"
```

---

## Task 6: 최종 검증 + 코드 리뷰 + 배포

**Files:** (변경 없음, 검증 및 배포만)

- [ ] **Step 1: 전체 테스트 실행**

Run (`apps/web` 디렉토리에서): `npx vitest run`
Expected: 모든 테스트 PASS (Task 1, 2에서 추가한 `lib/josa.test.ts`, `lib/systemPrompt.test.ts` 포함)

- [ ] **Step 2: 전체 타입 체크**

Run (`apps/web` 디렉토리에서): `npx tsc --noEmit`
Expected: 에러 없음 (종료 코드 0)

- [ ] **Step 3: 플레이스홀더 치환 호출부 누락 확인**

Run (`apps/web` 디렉토리에서):

```bash
grep -rn "replace(/\\\\{\\\\{user\\\\}\\\\}/gi" app --include=*.tsx
```

Expected: `app/(melting)/melting/characters/[id]/page.tsx`의 2곳(이제 `fixJosa(...)` 인자로 감싸져 있음) 외에는 결과 없음 — 다른 모든 호출부가 `replaceDisplayPlaceholders` 또는 `fixJosa`로 교체되었는지 확인.

- [ ] **Step 4: 최종 코드 리뷰**

`superpowers:requesting-code-review`의 `code-reviewer.md` 템플릿을 사용해 Task 1~5의 전체 diff(`lib/josa.ts`, `lib/josa.test.ts`, `lib/systemPrompt.ts`, `lib/systemPrompt.test.ts`, 7개 페이지 파일)에 대한 최종 리뷰를 수행한다. Critical/Important 이슈가 있으면 수정 후 재검토.

- [ ] **Step 5: 2단계 배포**

```bash
# 1. apps/web 서브모듈 — main 브랜치
cd apps/web
git push origin main

# 2. 부모 저장소 서브모듈 포인터 업데이트 — master 브랜치
cd ../..
git add apps/web
git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (한국어 조사 자동 교정)"
git push origin master
```

서버 배포 명령어 (사용자에게 안내):

```bash
git pull origin master && git submodule update --remote apps/web && docker compose up --build -d
```
