# Melting 센터 설계 (Design Spec)

**작성일:** 2026-06-10
**목표:** melting.chat 캐릭터를 StoryFit에 가져와 Melting 앱과 동일한 UI로 탐색·관리하는 독립 "Melting 센터"를 만든다. 호감도·추천답변·장 진행까지 Melting 채팅 경험을 클론하되, StoryFit의 기존 채팅 엔진(스탯 자동평가·상태추적·소설렌더링)을 최대한 재사용한다.

## 배경

- Melting capture는 이미 동작한다: Puppeteer로 페이지를 열어 `/api/characters/` 응답의 `apiData.bot`을 인터셉트해 구조화 데이터(`name`, `publicDescription`, `opening`, `publicTagline`, `profileImagePath`, `voiceId/voiceName`, `nsfw`, `tags/hashtagList`)를 얻는다. 실패 시 OG 메타로 폴백한다.
- StoryFit 채팅 엔진은 Melting의 "풀 클론" 기능 대부분을 이미 보유한다:
  - **호감도** → `Conversation.statsConfig`(name/value/min/max). 시스템 프롬프트에 `[현재 스탯] 호감도: 50/100`으로 주입됨.
  - **자동 갱신** → `triggerStoryEvaluation`(`lib/storyEval.ts`)가 매 턴 AI로 statsDelta(±10)를 받아 클램핑 적용. 재생성·삭제 시 `rollbackStatsDelta`로 롤백.
  - **상태 추적** → `triggerStateTracking`이 장소·시간·의상·상황을 statusTimeline에 요약.
  - **`!호감도` 명령** → 기존 chat 라우트가 `!호감도`/`!관계`/`!스탯`을 처리.
  - **선택지/composer-fill** → `parseStoryChoices` + composer 값 주입 패턴이 존재.
- 따라서 "풀 클론"에서 실제로 새로 만들 것은 **(1) Melting 센터 UI, (2) "추천 답변" UX, (3) 장 카운터** 셋뿐이다. 나머지는 기존 시스템 재사용 + import 배선이다.
- 프론트는 WHIF/Zeta 센터와 **완전 독립**. Melting 앱 스크린샷(`docs/MELTING/*.png`)을 기준으로 클론한다.

## 범위 (확정)

- **포함**: Melting 센터 홈/목록, 캐릭터 상세, import 메뉴, 호감도 스탯 자동 설정·갱신, 추천 답변(유저 발화 3개 제안 + 새로 생성), 장 카운터, 대화목록/채팅방 헤더 "N장" 뱃지.
- **제외**:
  - 새 스탯/평가 엔진 (기존 `lib/storyEval.ts` 재사용).
  - 제작자 authored "장" 콘텐츠 import — 공개 API가 `opening`/설명만 주므로 실제 장 콘텐츠를 가져올 수 없다. 장 진행은 **대화 진행에 따른 카운터로 근사**한다.
  - 창작(캐릭터 제작) 기능, Melting 전용 채팅 백엔드.
- **채팅방**: 기존 StoryFit 채팅방을 그대로 재사용. 추천 답변·장 뱃지만 조건부로 추가한다.

## 결정 사항 (브레인스토밍 확정)

- **채팅 경험**: 호감도·장 진행까지 풀 클론.
- **장 진행**: 장 카운터로 근사 — 실제 제작 장 대신, 대화 진행 중 장면 큰 전환 시 자동 증가하는 "N장" 카운터.
- **추천 답변 탭 동작**: 탭하면 입력창(composer)에 채움 — 유저가 수정 후 전송 가능.

## 아키텍처

### 라우팅 (WHIF/Zeta와 독립한 새 route group)

```
app/(melting)/
  layout.tsx                       ← 인증 체크(getAccessToken) + AppProvider + .melting-root 래퍼
  melting/
    page.tsx                       ← 홈/목록 (핑크 배너 + 캐릭터 그리드 + import 메뉴)
    characters/[id]/page.tsx       ← 캐릭터 상세 (id = CharacterCollection.id)
```

### CSS

- `app/globals.css`에 **`.melting-*` 클래스 신규 작성**. WHIF의 `.whif-*`, Zeta의 `.zeta-*`는 재사용하지 않는다.
- 테마: 다크 배경(`#0d0d12` 계열), 서피스(`#1a1a22`), 액센트는 핫핑크/마젠타(`#ff2e93` 계열) 그라디언트. `대화 시작하기` 버튼은 핑크 그라디언트.
- CSS 변수는 `.melting-root` 스코프에 정의한다 (`--m-bg`, `--m-surface`, `--m-surface-2`, `--m-line`, `--m-ink`, `--m-ink-soft`, `--m-accent`, `--m-radius`).

### 홈 진입점

- `app/(main)/page.tsx`의 메뉴 배열에 "MELTING 센터" 진입 버튼(`emoji: '🔥'`, `href: '/melting'`)을 WHIF/ZETA 센터 아래에 추가.

## 데이터 모델

**핵심 원칙:** Melting import도 기존 `CharacterCollection`(캐릭터 1개)로 래핑한다 — WHIF/Zeta 센터와 동일하게 collection 목록을 sourceUrl로 필터링해 센터를 구성한다. 원본 bot JSON은 `meltingMeta`에 통째로 보존한다.

### 스키마 변경

```prisma
model CharacterCollection {
  // ... 기존 필드 ...
  zetaMeta     Json?
  meltingMeta  Json?    // Melting import 시 원본 bot JSON 전체 보존
}

model Conversation {
  // ... 기존 필드 ...
  chapter                Int       @default(1)     // Melting 장 카운터
  suggestRepliesEnabled  Boolean   @default(false) // 추천 답변 노출 게이트
}
```

### 호감도 (기존 statsConfig 재사용)

- Melting 대화 생성 시 `statsEnabled=true`, `statsConfig=[{ name: '호감도', value: 50, min: 0, max: 100 }]`로 설정.
- 이후 매 턴 기존 `triggerStoryEvaluation`이 자동으로 호감도를 ±10 범위로 갱신하고, 재생성/삭제 시 `rollbackStatsDelta`가 되돌린다. **추가 엔진 구현 없음.**

### 필드 매핑

| Melting bot 필드 | 저장 위치 | 용도 |
|---|---|---|
| `name` | Collection.title + Character.name | 제목·캐릭터명 |
| `profileImagePath` | Collection.coverImageUrl + Character.avatarUrl | 커버/아바타 (`https://image-gen.melting.chat/public_images/{path}?s=lg`) |
| `publicTagline` | Conversation.scenarioDescription + meltingMeta | 한줄 소개 |
| `publicDescription` | Character.additionalInfo + meltingMeta | 상세 설정 |
| `opening` | Character.openingMessage + meltingMeta | 첫 장면 |
| `tags`/`hashtagList` + `#`해시태그 | Collection.tags + Character.tags | 태그 칩 |
| `voiceId`/`voiceName`/`voiceProvider` | Character.additionalInfo의 `[음성 설정]` 블록 (기존 동작) | 음성 정보 보존 |
| `nsfw`/`isNsfw` | → `safetyLevel='relaxed'` 판정 (기존 동작) | 안전등급 |
| 원본 bot 전체 | Collection.meltingMeta | 누락 방지 raw 보존 |

## captureMelting 변경

`lib/import/capture.ts`의 `captureMelting`은 **기존 로직을 유지**하되, `apiData`(bot raw)를 `Captured.meltingMeta`로 함께 반환하도록만 보강한다.

- `apiData.bot` 인터셉트 성공 경로: 기존 `assembledResult` 구성에 더해 반환 객체에 `meltingMeta: apiData`(bot raw) 추가.
- OG 메타 폴백 경로: `meltingMeta` 없음(undefined).
- `Captured` 인터페이스에 `meltingMeta?: any` 필드 추가 (`lib/import/types.ts`).

## import route 변경

`app/api/characters/import/route.ts`:

- `isMelting = matchesHost(url, 'melting.chat')` 분기 추가.
- `isImmersive = isWhif || isZeta || isMelting` — Melting도 roleplay 모드 + `c.tags` 사용 (단일 캐릭터이므로 `isMulti=false` → `roleplay`).
- collection 생성 시 `meltingMeta` 저장 (`captured.meltingMeta`가 있을 때만).
- 중복 방지: 기존 `sourceUrl`(melting 캐릭터 URL)로 dedup (기존 동작).

> **호감도/추천답변 설정은 import route가 아니라 상세 페이지의 대화 생성 시점에 적용한다** (아래 "데이터 흐름" 참조). import가 만드는 더미 conversation(`collection.conversationId`)은 WHIF/Zeta와 마찬가지로 채팅에 쓰이지 않으므로 Melting 설정을 둘 필요가 없다.

## 추천 답변 (신규)

### 엔드포인트

`POST /api/conversations/[id]/suggestions`

- 인증 + 소유권 확인.
- 최근 대화 히스토리(마지막 assistant 메시지 포함 6~8턴)와 페르소나 정보로 **유저가 할 법한 짧은 발화 3개**를 생성한다.
- 경량 `generateText(systemPrompt, userPrompt)` 1회 호출 → JSON `{ "suggestions": ["...", "...", "..."] }` 파싱.
- 반환: `{ suggestions: string[] }` (최대 3개, 파싱 실패 시 빈 배열).
- 프롬프트 규칙: 1인칭 유저 시점, 행동(`*...*`)·대사(`"..."`) 혼용 가능, 각 1~2문장, 서로 다른 톤(적극/소극/중립).

### 순수 함수 (테스트 대상)

`lib/suggestions.ts`:
- `buildSuggestionPrompt(history, personaName): { systemPrompt, userPrompt }` — 프롬프트 조립.
- `parseSuggestions(raw: string): string[]` — JSON 추출·검증, 최대 3개로 절단.

### 채팅방 UI

`app/(main)/conversations/[id]/page.tsx`:
- `conv.suggestRepliesEnabled === true`이고 마지막 메시지가 assistant일 때만, 메시지 영역 하단(composer 위)에 추천 답변 칩 3개 + "🔄 새로 생성" 버튼 표시.
- 진입/마지막 응답 수신 후 자동으로 1회 호출. "새로 생성" 클릭 시 재호출.
- 칩 **탭 → composer 값 주입**(기존 `composerRef.current.value = content; dispatch input; focus()` 패턴) — 자동 전송하지 않음.
- 로딩 중 스켈레톤/스피너 표시. 실패 시 조용히 숨김.

## 장 카운터 (신규)

- `Conversation.chapter Int @default(1)`.
- `lib/storyEval.ts`의 `triggerStateTracking` 프롬프트 JSON에 `newChapter: boolean` 필드 추가:
  - 규칙: 장소·시간대가 **근본적으로 전환**(예: 큰 시간 점프, 완전히 새로운 장소/상황으로 이동)됐을 때만 `true`.
- `newChapter === true`면 `chapter` 1 증가(`prisma.conversation.update`).
- 표시: 대화목록 카드 + 채팅방 헤더에 "N장" 뱃지(Melting 대화, 즉 `suggestRepliesEnabled` 또는 melting collection일 때).
- 롤백: 재생성 시 직전 장 증가가 있었다면 되돌릴 필요는 낮으나, 단순화를 위해 chapter 롤백은 하지 않는다(근사 카운터이므로 허용 오차).

## API 필터

- `app/api/characters/route.ts`, `app/api/collections/route.ts`:
  - `source`에 `'melting'` 추가 → `sourceUrl contains 'melting.chat'`.
  - 일반 목록(regular) 필터에서 **melting.chat도 제외**(NOT 조건 추가). 기존 whif/zeta 제외와 동일 패턴.
- `app/api/collections/route.ts`의 목록 GET `select`에 `meltingMeta: true` 추가.
- `app/api/collections/[id]/route.ts`는 `include: { characters: true }`로 collection 전체 필드(meltingMeta 포함)를 반환하므로 변경 불필요.

## UI

### 홈/목록 (`melting/page.tsx`)

- 상단: 핑크 로고/배너 "melting" + 우상단 ⋮ import 메뉴(`https://melting.chat/...` URL 입력 → `/api/characters/import`). 편집 모드(삭제) 토글. (Zeta 목록 페이지 구조 차용하되 `.melting-*` 클래스.)
- 본문: 캐릭터 카드 그리드 — 커버 이미지 + 이름 + 해시태그. 가져온 캐릭터가 많지 않으므로 단일 그리드(섹션 분리는 생략, 스크린샷의 "인기/새로추가" 캐러셀은 데이터가 적어 무의미 → 단순 그리드).
- 빈 상태 안내.

### 상세 (`melting/characters/[id]/page.tsx`)

스크롤 순서 (스크린샷 기준):
1. 커버 이미지 + 좌상단 뒤로가기.
2. 아바타 + 이름(+ NSFW/인증 뱃지) + 해시태그 칩.
3. **소개**: publicTagline.
4. **상세 설정**: publicDescription (접기/펼치기 또는 전체 표시).
5. **첫 장면**: opening 미리보기 (NovelText 렌더, `{{user}}`→"나", `{{char}}`→캐릭터명 치환).
6. 하단 고정 `대화 시작하기` 핑크 버튼 → 페르소나 모달 → 기존 채팅방.

### 페르소나

- 기존 페르소나 모달(WhifPersonaModal) 재사용. Melting bot에는 추천 페르소나 데이터가 없으므로 프리필 없이 기본 폼.

### 데이터 흐름 (대화 생성)

- WHIF/Zeta 센터에서 "대화 시작하기"는 메인 캐릭터로 **새 conversation을 생성**한다(`POST /api/conversations`). Melting도 동일하게 새 conversation을 만들되, **생성 페이로드에 Melting 설정을 명시**한다:
  - `mode: 'roleplay'`
  - `statsEnabled: true`
  - `statsConfig: [{ name: '호감도', value: 50, min: 0, max: 100 }]`
  - `suggestRepliesEnabled: true`
  - `openingMessage: <첫 장면>`
- `POST /api/conversations`는 이미 `mode`/`statsEnabled`/`statsConfig`/`openingMessage`를 페이로드에서 수용한다. **`suggestRepliesEnabled` 수용만 추가**(`body.suggestRepliesEnabled ?? false`)하면 된다. `chapter`는 스키마 기본값(1)을 그대로 둔다.

## 테스트

- `lib/suggestions.ts`의 `buildSuggestionPrompt`/`parseSuggestions` 단위 테스트(vitest, node) — JSON 파싱·절단·검증.
- 호감도/장 카운터/추천답변 엔드포인트의 AI 호출 부분은 단위 테스트 대상 아님(순수 함수만 테스트).
- 빌드(`tsc --noEmit`) + `npm run build` 통과.

## 배포

- `apps/web` 서브모듈(main) 커밋·푸시 → 부모(master) 서브모듈 포인터 업데이트.
- `meltingMeta`/`chapter`/`suggestRepliesEnabled` 컬럼은 서버 빌드 시 `db push`로 자동 반영.

## 영향 없는 것

- WHIF/Zeta 센터 코드·CSS (완전 독립).
- 기존 채팅 엔진(스탯 평가·상태추적·롤백) — 재사용만, 로직 변경 없음(단, `triggerStateTracking` JSON에 `newChapter` 필드 1개 추가).
- 비-Melting 대화 — `suggestRepliesEnabled` 기본 false라 추천답변 UI 미노출, chapter 미표시.
