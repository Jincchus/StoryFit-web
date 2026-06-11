# user/persona 플레이스홀더 매핑 통일 — 전역 적용 설계

**작성일:** 2026-06-11
**상태:** 승인됨

## 목표

캐릭터/플롯 텍스트(`additionalInfo`, `scenarioDescription`, 로어북, 도입부 등)에 "Guest", "User", "당신", "페르소나" 등 다양한 표기로 섞여 들어오는 유저 플레이스홀더가, 카드 표시(클라이언트)와 채팅/시스템 프롬프트(서버) 양쪽에서 항상 동일한 기준으로 페르소나 이름으로 치환되도록 통일한다.

## 배경

- ZETA import (`lib/import/zeta.ts`)의 `normalizeGuest`는 정확히 "Guest"(대문자 G)만 `{{user}}`로 변환한다. 원본 데이터에는 "User", "user", "Guest" 등 여러 표기가 섞여 있어, "Guest"는 `{{user}}`로 정규화되지만 "User"는 그대로 남는다.
- 서버 측 `lib/systemPrompt.ts`의 `replacePlaceholders(text, personaName, charName?)`는 `{{user}}`, `{user}`, `[유저]`, `\bguest\b`, `\buser\b`, `페르소나`, `주인공`, `당신` 등 폭넓은 패턴을 대소문자 무관하게 personaName으로 치환한다. 이 함수는 시스템 프롬프트 조립과 채팅 메시지 표시(서버)에서 사용된다.
- 반면 클라이언트 카드 표시용 `lib/josa.ts`의 `replaceDisplayPlaceholders(text, userName, charName?)`(Feature 3에서 신설, WHIF/ZETA/MELTING 카드·상세·대화화면 13곳에서 사용)는 `{{user}}`/`{{char}}`만 치환한다.
- 결과적으로 ZETA 카드에서 "Guest"는 (`normalizeGuest`를 거쳐 `{{user}}`가 되어) 정상 치환되지만, "User"는 `replaceDisplayPlaceholders`가 처리하지 못해 그대로 노출된다 — "user로 들어오는 경우도 있고 guest로 들어오는 경우도 있는데 일관되지 않다"는 문제의 원인.
- 추가로 `app/api/conversations/[id]/chat/route.ts`에서 personaCharacter가 없을 때의 기본 이름이 위치마다 `'나'`(145번 줄)와 `'유저'`(292번 줄)로 다르다.

## 1. `lib/josa.ts` — 공유 패턴 함수 `applyPersonaPlaceholders` 신설

`lib/systemPrompt.ts`의 `replacePlaceholders`에 있던 치환 체인(`fixJosa` 호출 제외)을 그대로 `lib/josa.ts`로 옮겨 공유 함수로 만든다:

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
```

치환 순서는 기존 `replacePlaceholders`와 동일하게 유지한다(charName 패턴 먼저, 그 다음 personaName 패턴).

### `replaceDisplayPlaceholders` 단순화

```ts
export function replaceDisplayPlaceholders(text: string, userName: string, charName?: string): string {
  return fixJosa(applyPersonaPlaceholders(text, userName, charName), [userName, charName])
}
```

기존의 `{{user}}`/`{{char}}`만 처리하던 로직을 `applyPersonaPlaceholders` 호출로 교체한다. 이 변경만으로 클라이언트 카드 13곳(WHIF/ZETA/MELTING/대화화면)에서 "Guest"/"User"/"GUEST"/"guest"/"당신"/"페르소나"/"주인공"/`[유저]`/`{유저}`/`[USER]` 등이 모두 페르소나 이름으로 치환된다.

## 2. `lib/systemPrompt.ts` — `replacePlaceholders` 단순화

```ts
export function replacePlaceholders(text: string, personaName: string, charName?: string): string {
  return fixJosa(applyPersonaPlaceholders(text, personaName, charName), [personaName, charName])
}
```

동작은 기존과 동일하며 중복 코드만 제거한다. `lib/josa.ts`에서 `applyPersonaPlaceholders`를 import한다.

## 3. personaName 폴백 통일

`app/api/conversations/[id]/chat/route.ts:292`:
```ts
personaName: conv.personaCharacter?.name || conv.user?.displayName || '유저',
```
을
```ts
personaName: conv.personaCharacter?.name || conv.user?.displayName || '나',
```
로 변경하여, 같은 파일 145번 줄의 `personaName` 계산 기준과 일치시킨다.

## 4. 테스트

- `lib/josa.test.ts`:
  - `applyPersonaPlaceholders`에 대한 단위 테스트 추가: `{{user}}`, `{user}`, `[유저]`, `{유저}`, `[USER]`, `Guest`, `User`, `GUEST`, `guest`, `persona`, `페르소나`, `주인공`, `당신`, `{{char}}`, `{char}`, `{캐릭터}` 각각이 정상 치환되는지 확인.
  - `replaceDisplayPlaceholders`에 "Guest"/"User"/"당신"/"페르소나" 케이스를 추가해, 클라이언트 카드 경로에서도 동일하게 치환됨을 확인.
- `lib/systemPrompt.test.ts`: 기존 테스트가 `applyPersonaPlaceholders` 경유로도 동일하게 통과하는지 회귀 확인(동작 변화 없음이므로 기존 케이스 그대로 통과해야 함).
- 전체 `vitest run` (기존 75개 + 신규 케이스) 통과 확인.

## 엣지 케이스

- 서버에서 이미 `replacePlaceholders`로 치환된 텍스트(예: 대화 메시지)에 클라이언트가 `replaceDisplayPlaceholders`를 한 번 더 적용하는 기존 이중 적용 구조는 그대로 유지된다. 패턴 세트가 늘어나면서(`당신`/`주인공`/`페르소나`/`guest`/`user` 등) 페르소나 이름이 우연히 이 단어들과 겹칠 극히 드문 경우 과교정 가능성이 있으나, Feature 3 스펙에서 이미 수용한 것과 동일한 종류·수준의 리스크이므로 별도 처리하지 않는다.
- `lib/import/zeta.ts`의 `normalizeGuest`("Guest" → `{{user}}`)는 변경하지 않는다 — `applyPersonaPlaceholders`가 `\bguest\b`/`\buser\b`를 직접 처리하므로 동작에 영향 없이 중복으로 남는다.

## 비목표 (Out of Scope)

- `lib/import/zeta.ts`의 `normalizeGuest` 자체 수정.
- `personaCharacter` 데이터 모델/할당 로직 변경 — 표시·치환 로직만 다룬다.

## 공개 인터페이스 요약

| 함수 | 위치 | 용도 |
|------|------|------|
| `applyPersonaPlaceholders(text, personaName, charName?)` | `lib/josa.ts` (신규) | `{{user}}`/`{{char}}`/`Guest`/`User`/`당신`/`페르소나` 등 플레이스홀더 패턴을 이름으로 치환 (조사 교정 제외) |
| `replaceDisplayPlaceholders(text, userName, charName?)` | `lib/josa.ts` (수정, 내부에서 `applyPersonaPlaceholders` + `fixJosa` 사용) | 클라이언트 카드/대화화면 13곳 |
| `replacePlaceholders(text, personaName, charName?)` | `lib/systemPrompt.ts` (수정, 내부에서 `applyPersonaPlaceholders` + `fixJosa` 사용) | 서버 측 시스템 프롬프트/채팅 메시지 치환 |
