# 한국어 조사(은/는/이/가 등) 자동 교정 — 전역 적용 설계

**작성일:** 2026-06-11
**상태:** 승인됨

## 목표

캐릭터 설정 텍스트(`additionalInfo`, `scenarioDescription`, `exampleDialogues` 등)에 `{{user}}는`, `{{char}}이` 처럼 플레이스홀더와 조사가 함께 하드코딩된 경우, 플레이스홀더를 실제 페르소나/캐릭터 이름으로 치환한 뒤 받침 유무에 따라 조사가 맞지 않는 문제(`"민준는 학교에 갔다"`)를 자동으로 교정한다(`"민준은 학교에 갔다"`). 채팅창, 캐릭터 카드(WHIF/ZETA/MELTING 포함), 캐릭터 설정 텍스트 전부 동일한 로직으로 처리한다.

## 배경

`lib/systemPrompt.ts`의 `replacePlaceholders(text, personaName, charName?)`가 `{{user}}`, `{user}`, `[유저]`, `guest`, `persona`, `페르소나`, `주인공`, `당신`, `{{char}}`, `{char}`, `{캐릭터}` 등 다양한 패턴을 실제 이름으로 치환하는 단일 지점이며, 시스템 프롬프트 조립과 채팅 메시지 표시(서버) 양쪽에서 사용된다.

이와 별개로 클라이언트 13곳(WHIF/ZETA/MELTING 카드, 대화 화면)에서 `.replace(/\{\{user\}\}/gi, '나').replace(/\{\{char\}\}/gi, charName)` 형태의 거의 동일한 치환이 중복되어 있다.

두 경로 모두 치환 결과 텍스트에 원래 하드코딩되어 있던 조사가 새 이름의 받침과 맞지 않을 수 있다. `lib/import/capture.ts`에는 받침 유무로 "과/와"만 고르는 `josa과와()`가 이미 존재하지만(다른 용도, 변경 없음), 이번 기능은 이를 일반화한 8개 조사쌍을 다룬다.

## 1. `lib/josa.ts` — 핵심 순수 함수 모듈 (신규)

```ts
type JosaPair = '은/는' | '이/가' | '을/를' | '와/과' | '로/으로' | '(이)라' | '(이)나' | '(이)며'

function getJosa(word: string, pair: JosaPair): string
export function fixJosa(text: string, names: (string | undefined | null)[]): string
export function replaceDisplayPlaceholders(text: string, userName: string, charName?: string): string
```

### `getJosa(word, pair)`
- `word`의 마지막 글자(공백 제거 후)의 한글 종성(받침) 유무로 판정.
- 한글 음절(U+AC00~U+D7A3)이 아닌 문자로 끝나면 받침 없음으로 간주(기존 `josa과와`와 동일 정책).
- 판정 규칙:
  - `은/는`: 받침 있음 → `은`, 없음 → `는`
  - `이/가`: 받침 있음 → `이`, 없음 → `가`
  - `을/를`: 받침 있음 → `을`, 없음 → `를`
  - `와/과`: 받침 있음 → `과`, 없음 → `와`
  - `로/으로`: 받침 없음 또는 받침이 `ㄹ`(종성 코드 8) → `로`, 그 외 받침 → `으로`
  - `(이)라`: 받침 있음 → `이라`, 없음 → `라`
  - `(이)나`: 받침 있음 → `이나`, 없음 → `나`
  - `(이)며`: 받침 있음 → `이며`, 없음 → `며`

### `fixJosa(text, names)`
- `names`에 주어진 각 이름(예: 페르소나 이름, 캐릭터 이름, `'나'`)에 대해, 텍스트 내 `이름+조사` 패턴을 찾아 받침에 맞는 조사로 교정한다.
- `null`/`undefined` 이름은 무시한다.
- 이미 올바른 조사가 붙어 있으면 변화 없음(멱등).
- 조사 그룹 처리 순서가 중요하다 — 길고 구체적인 패턴을 먼저 처리해야 충돌을 피한다:
  1. `(이)라`, `(이)나`, `(이)며` (긴 변형 `이라/이나/이며`을 짧은 변형 `라/나/며`보다 먼저 매칭)
  2. `로/으로` (`으로`를 `로`보다 먼저 매칭)
  3. `은/는`, `이/가`, `을/를`, `와/과`
  - 예: 이름 "철수"(받침 없음) + 텍스트 "철수이라면" → 1단계에서 "철수"+"이라" 매칭 → `getJosa('철수','(이)라')`="라" → "철수라면"으로 교정. 이후 2~3단계에서 "철수라면"은 추가로 매칭되지 않음 (만약 1단계를 건너뛰고 3단계 "이/가"가 먼저 처리됐다면 "철수이"→"철수가"가 되어 "철수가라면"이라는 잘못된 결과가 나옴 — 그래서 순서가 중요).

### `replaceDisplayPlaceholders(text, userName, charName?)`
```ts
export function replaceDisplayPlaceholders(text: string, userName: string, charName?: string): string {
  let result = text.replace(/\{\{user\}\}/gi, userName)
  if (charName) result = result.replace(/\{\{char\}\}/gi, charName)
  return fixJosa(result, [userName, charName])
}
```
클라이언트 13곳의 중복된 `.replace({{user}}).replace({{char}})` 체인을 대체하는 공용 헬퍼. 순수 함수이므로 서버/클라이언트 어디서든 import 가능.

## 2. 서버 적용 — `lib/systemPrompt.ts`

기존 `replacePlaceholders(text, personaName, charName?)`의 모든 `.replace(...)` 체인은 그대로 유지하고, 마지막에 `fixJosa(result, [personaName, charName])`를 추가로 적용한 뒤 반환한다.

이 함수는 이미 다음 모든 곳에서 호출되므로 별도 수정 없이 자동 적용된다:
- `lib/systemPrompt.ts` 내 시스템 프롬프트 조립 6곳 (`additionalInfo`, `scenarioDescription`, `exampleDialogues`)
- `app/api/conversations/[id]/route.ts` — 대화 메시지 조회 시 표시용 치환
- `app/api/conversations/[id]/chat/route.ts` — AI 전송 직전 메시지 정리

즉 채팅창 + 캐릭터 설정 텍스트(시스템 프롬프트로 들어가는 모든 필드)는 이 한 곳의 변경만으로 커버된다.

## 3. 클라이언트 적용 — 카드/대화 화면 13곳 교체

다음 13개 호출부의 `.replace(/\{\{user\}\}/gi, X).replace(/\{\{char\}\}/gi, Y)` 체인을 `replaceDisplayPlaceholders(text, X, Y)` 한 줄로 교체한다:

| 파일 | userName (X) | charName (Y) |
|------|----------|----------|
| `app/(whif)/whif/page.tsx:165-166` | `'나'` | `c.name` |
| `app/(whif)/whif/universes/[id]/page.tsx:94-95` | `'나'` | `uni.characters?.[0]?.name ?? ''` |
| `app/(whif)/whif/characters/[id]/page.tsx:148-149` | `'나'` | `char.name` |
| `app/(whif)/whif/characters/[id]/page.tsx:169-170` | `'나'` | `char.name` |
| `app/(zeta)/zeta/page.tsx:131` | `'나'` | `mainChar?.name ?? ''` |
| `app/(zeta)/zeta/plots/[id]/page.tsx:225-226` | `'나'` | `c.name` |
| `app/(zeta)/zeta/plots/[id]/page.tsx:241-242` | `'나'` | `mainChar?.name ?? ''` |
| `app/(zeta)/zeta/plots/[id]/page.tsx:261-262` | `'나'` | `mainChar?.name ?? ''` |
| `app/(zeta)/zeta/plots/[id]/page.tsx:279-280` | `'나'` | `mainChar?.name ?? ''` |
| `app/(melting)/melting/characters/[id]/page.tsx:148-149` | `'나'` | `mainChar.name` |
| `app/(melting)/melting/characters/[id]/page.tsx:160-161` | `'나'` | `mainChar?.name ?? ''` |
| `app/(main)/conversations/[id]/page.tsx:1026-1027` | `conv.personaCharacter?.name ?? '나'` | `msgChar.name` |
| `app/(main)/conversations/[id]/page.tsx:1297-1298` | `conv.personaCharacter?.name ?? '나'` | `streamingChar.name` |

`'나'`(받침 없음)는 대부분 기존과 동일한 조사가 정답이지만, 페르소나 이름이 들어가는 경우(`conversations/[id]/page.tsx`)는 자동 교정된다.

## 4. 엣지 케이스

- 텍스트에 받침이 없는 이름이 이미 올바른 조사("는/가/를/와/로/라/나/며")와 함께 쓰여 있으면 `fixJosa`는 변화를 주지 않는다(멱등).
- 이름이 영문/숫자 등 한글 음절이 아닌 문자로 끝나면 받침 없음으로 간주한다.
- `personaName`/`charName`/`userName`이 `undefined`/`null`/빈 문자열이면 해당 이름에 대한 교정은 건너뛴다.
- 캐릭터 이름 자체에 일반 단어("이라면" 등)가 포함되어 우연히 조사 패턴과 겹치는 극히 드문 경우, `fixJosa`가 과교정할 수 있으나 발생 확률이 낮고 결과도 자연스러운 한국어 문장이 되므로 별도 처리하지 않는다.

## 비목표 (Out of Scope)

- `lib/import/capture.ts`의 기존 `josa과와()`(과/와 전용, 다른 용도)는 변경하지 않음.
- 캐릭터 설정 페이지(편집 폼)의 입력 필드 자체에는 적용하지 않음 — 입력값은 placeholder 원문 그대로 저장되고, 표시/치환 시점에서만 교정됨.
- ZETA guest/user 페르소나 매핑 수정(별도 스펙 "Feature 2"로 진행).

## 공개 인터페이스 요약

| 함수 | 위치 | 용도 |
|------|------|------|
| `fixJosa(text, names)` | `lib/josa.ts` (신규) | 텍스트 내 이름 뒤 조사를 받침에 맞게 교정 |
| `replaceDisplayPlaceholders(text, userName, charName?)` | `lib/josa.ts` (신규) | `{{user}}`/`{{char}}` 치환 + `fixJosa` 통합, 클라이언트 13곳에서 사용 |
| `replacePlaceholders(text, personaName, charName?)` | `lib/systemPrompt.ts` (기존, 내부에서 `fixJosa` 추가 호출) | 서버 측 플레이스홀더 치환 + 조사 교정 |
