# Zeta 센터 설계 (Design Spec)

**작성일:** 2026-06-10
**목표:** zeta-ai.io의 플롯/캐릭터를 StoryFit에 가져와, Zeta 앱과 동일한 UI로 탐색·관리하는 독립 "Zeta 센터"를 만든다. API로 들어오는 JSON 데이터를 누락 없이 활용한다.

## 배경

- WHIF/Melting은 Puppeteer로 내부 API 응답을 가로채 구조화 JSON을 얻는다.
- Zeta는 공개 REST API `https://api.zeta-ai.io/v1/plots/{plotId}` 가 **인증 없이 200** 으로 완전한 구조화 JSON을 반환한다. (디버그로 확인 완료)
- 기존 `captureZeta`는 HTML 스크래핑 + AI 분류기를 쓰고 있어 데이터 품질이 낮다 → REST API 직접 호출로 전면 교체한다.
- 프론트는 WHIF 센터와 **완전 독립**. Zeta 앱 스크린샷(`docs/ZETA/*.png`)을 기준으로 클론한다.

## 범위 (확정)

- **포함**: 플롯 목록 화면, 플롯 상세(커버/제목/소개/태그/대화수/캐릭터/인트로/크리에이터/로어북 인라인), import 메뉴.
- **제외**: 로어북 전용 상세 페이지, "마음에 들었다면" 관련 플롯 추천(채팅 영향 없는 탐색용 — 가져온 플롯이 적어 무의미).
- **채팅방**: 기존 StoryFit 채팅방을 그대로 재사용. Zeta 전용 채팅 UI는 만들지 않는다.

## 아키텍처

### 라우팅 (WHIF와 독립한 새 route group)

```
app/(zeta)/
  layout.tsx              ← 인증 체크(getAccessToken) + AppProvider + .zeta-root 래퍼
  zeta/
    page.tsx              ← 플롯 목록 (2열 그리드)
    plots/[id]/page.tsx   ← 플롯 상세 (id = CharacterCollection.id)
```

### CSS

- `app/globals.css`에 **`.zeta-*` 클래스 신규 작성**. WHIF의 `.whif-*`는 재사용하지 않는다.
- 테마: 다크 배경(`#0d0d0f` 계열), 서피스(`#1a1a1f`), 액센트는 보라/블루 그라디언트. `대화 시작하기` 버튼은 보라 그라디언트.
- CSS 변수는 `.zeta-root` 스코프에 정의한다 (`--z-bg`, `--z-surface`, `--z-line`, `--z-ink`, `--z-ink-soft`, `--z-accent` 등).

### 홈 진입점

- `app/(main)/page.tsx` 의 메뉴/안내 영역에 "ZETA 센터" 진입 버튼(`href: /zeta`) 추가.

## 데이터 모델 — JSON 누락 0 보장

**핵심 원칙:** `CharacterCollection`에 `zetaMeta Json?` 필드를 추가하고 **원본 plot JSON을 통째로 저장**한다. 화면에서 자주 쓰는 값만 정규화 컬럼에 복제한다. 이로써 어떤 필드도 버려지지 않는다.

### 스키마 변경

```prisma
model CharacterCollection {
  // ... 기존 필드 ...
  zetaMeta Json?   // Zeta import 시 원본 plot JSON 전체 보존
}
```

### 필드 매핑

| Zeta JSON 필드 | 저장 위치 | 용도 |
|---|---|---|
| `name` | Collection.title + Character.name | 제목·캐릭터명 |
| `imageUrl` | Collection.coverImageUrl | 커버 이미지 |
| `shortDescription` | zetaMeta (+ Collection.description) | 한줄 소개 |
| `longDescription` | Conversation.scenarioDescription + zetaMeta | 시나리오(시스템프롬프트) |
| `hashtags` | Collection.tags + Character.tags | 태그 칩 |
| `characters[]` | Character 레코드 N개 (`description`→additionalInfo, `imageUrl`→avatarUrl, `name`→name) | 캐릭터 섹션 + 시스템프롬프트 |
| `chatProfiles[]` | zetaMeta | 추천 유저 페르소나 |
| `intros[]` | Character.openingMessages(구조화) + zetaMeta | 인트로/첫 메시지 |
| `lorebooks[]` | Lorebook 레코드 (scope=collection + conversation) | 키워드 매칭 시 주입 (채팅 영향 O) |
| `creator{}` / `creatorComment` | zetaMeta | 크리에이터 섹션 |
| `interactionCount`,`interactionCountWithRegen` | zetaMeta | 대화수 배지 |
| `createdAt`/`releasedAt`/`updatedAt` | zetaMeta | 출시일·수정일 |
| `verified` | zetaMeta | 인증 배지 |
| `initialRoomImageUrl` | zetaMeta | 채팅방 배경(추후 활용 여지) |
| `unlimitedAllowed` | → `safetyLevel='relaxed'` 판정 | 안전등급 |
| `status`/`language`/`about`/`is*Public`/`isPrivate`/`isLocked`/`originatedId`/`supportedFeatures`/`infoBoxSetting`/`cyoaSetting` | zetaMeta (raw 보존) | 누락 방지용 통째 저장 |

## captureZeta 재작성

`lib/import/capture.ts`의 `captureZeta`를 전면 교체한다.

- 기존 HTML 스크래핑 + AI 분류기(`splitIntoBlocks`/`classifyBlocks`/`assemble`) 경로를 Zeta에 대해 **사용하지 않는다**.
- URL에서 plotId 추출 → `fetch('https://api.zeta-ai.io/v1/plots/{plotId}')` → JSON.
- `AssembledResult`를 직접 조립한다 (`assembledResult`로 반환해 import route의 AI 분류 단계를 건너뜀 — WHIF와 동일 패턴).
- **인트로 변환:** `intros[].conversation.messages[]`를 `senderId`로 구분한다.
  - `senderId === '_NARRATOR_'` → 나레이션 그대로
  - `senderId === character.id` → 해당 캐릭터 대사
  - 한 intro의 메시지들을 `\n\n`으로 join → openingMessages 항목 1개.
  - intro가 여러 개면 openingMessages 배열로 (제목은 `도입부 N`).
- **`Guest` → `{{user}}` 정규화:** Zeta API는 `{{user}}`를 "Guest"로 미리 치환해 내려준다. 페르소나 치환이 동작하도록 콘텐츠 내 "Guest"를 `{{user}}`로 되돌린다 (Melting의 `depersonalizeNickname`과 동일 원리, 단순 부분일치 치환).
- `lorebooks` → `Captured.lorebooks` (keyword/content/priority).
- `zetaMeta` = raw plot JSON 전체.
- `sourceUrl` = canonical plot URL(`https://zeta-ai.io/ko/plots/{id}/profile`) → 중복 import 방지 기준.

### types.ts 변경

```ts
export interface Captured {
  // ... 기존 ...
  zetaMeta?: any   // Zeta 원본 plot JSON
}
```

## import route 변경

`app/api/characters/import/route.ts`:

- `isZeta = matchesHost(url, 'zeta-ai.io')` 분기 추가.
- Zeta일 때 collection 생성 시 `zetaMeta` 저장.
- openingMessages를 메인 캐릭터에 저장 (WHIF와 동일).
- 중복 방지: `captured.sourceUrl`(또는 universeUrl 자리에 zeta plot canonical URL)로 dedup.
- 캐릭터 tags는 `c.tags` (hashtags), lorebooks는 collection + conversation scope로 저장.

## API 필터

- `app/api/characters/route.ts`, `app/api/collections/route.ts`:
  - `isZeta=true` 쿼리 → `sourceUrl contains 'zeta-ai.io'`.
  - 일반 목록(비-whif) 필터에서 **zeta-ai.io도 제외**하도록 NOT 조건 추가 (WHIF와 동일하게 분리).
- `app/api/collections/[id]/route.ts`:
  - 상세 페이지용으로 `zetaMeta`, characters(이름/아바타/설정/태그/openingMessages), lorebooks를 반환하는지 확인하고 필요한 필드를 select에 추가.

## UI

### 목록 (`zeta/page.tsx`)

- 상단: 로고 "ZETA" + 우상단 ⋮ import 메뉴 (`https://zeta-ai.io/...` URL 입력 → `/api/characters/import` 호출). 편집 모드(삭제) 토글.
- 본문: **2열 그리드 카드** — 커버 이미지 + 좌상단 대화수 배지(💬 interactionCount) + 이름 + 해시태그.
- 빈 상태 안내.

### 상세 (`zeta/plots/[id]/page.tsx`)

스크롤 순서 (스크린샷 기준):
1. 커버 이미지(정사각형) + 좌상단 뒤로가기 + 크리에이터 핸들 오버레이(`@username`).
2. 제목(name) + shortDescription + 대화수 배지 + 해시태그 칩.
3. **캐릭터** 섹션: characters[] 카드(아바타 + 이름).
4. **인트로** 섹션: intros를 NovelText로 렌더(여러 개면 탭 선택). `{{user}}`→페르소나/"나", `{{char}}`→캐릭터명 치환.
5. **크리에이터** 섹션: creatorComment + 프로필(아바타/nickname/@username) + 출시일·수정일.
6. **로어북** 인라인 카드 (lorebooks 있을 때만): 제목 + 메타. 상세 페이지로 이동하지 않음.
7. 하단 고정 `대화 시작하기` 버튼 → 페르소나 모달 → 기존 채팅방.

### 페르소나

- 기존 페르소나 모달(WhifPersonaModal) 재사용. `chatProfiles[0]`의 name/description/summary를 새 페르소나 폼 추천값으로 프리필.
- 채팅방 생성은 기존 `/api/conversations` 흐름 그대로.

## 배포

- `apps/web` 서브모듈(main) 커밋·푸시 → 부모(master) 서브모듈 포인터 업데이트.
- `zetaMeta` 컬럼은 `db push`가 서버 빌드 시 자동 반영.

## 영향 없는 것

- WHIF 센터 코드/CSS (완전 독립).
- 기존 채팅방·페르소나 시스템 (재사용만, 변경 없음).
- Melting import.
