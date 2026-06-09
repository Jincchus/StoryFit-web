# WHIF 센터 재설계 (1단계: 탐색 + 상세)

작성일: 2026-06-09
대상: `apps/web` (반응형 웹 → `apps/mobile` WebView로 자동 커버)

## 1. 목표

현재 데스크톱 Win 창 안에 있는 "WHIF 통합 센터"를, whif.io의 실제 소비 UI/UX(다크 + 퍼플, 카드형, 풀화면 몰입형)와 **동일하게** 재설계한다.
또한 import로 가져온 데이터가 whif와 같은 정보(작품 커버/설명/태그)를 보여줄 수 있도록 데이터 모델과 import 매핑을 보강한다.

## 2. 범위

**1단계 (이 spec)**
- 데이터 모델 보강 + import 매핑 수정
- 풀화면 몰입형 라우트/레이아웃 + 다크 테마 토큰
- 화면 3종: 탐색(홈), 작품(세계관) 상세, 캐릭터 상세(시작 상황=도입부 칩 포함)
- 관리 기능(import/생성/수정/삭제/로어북)은 ⋮ 메뉴 / 편집 모드로 격리

**2단계 (별도 spec, 이번 제외)**
- "대화하기"(채팅 진입: 페르소나 선택/생성·이름·성별·설정·관계 레벨) 재설계
- 채팅 화면(도입부 캐러셀·말풍선·입력바·작가 추천 첫 메시지) 재설계
- 1단계의 "채팅 하기" 버튼은 **기존 흐름**(현 `PersonaSelectModal` → `/conversations/[id]`)에 연결해 동작 유지

**비목표**
- 좋아요/조회수/공유된 픽션 등 whif 소셜 지표 (개인용이라 불필요 — 전면 제외)
- 제작자 핸들 표시 (불필요 — 제외)
- 캐릭터 소개의 요약/역할/관계 컬럼 분리 (whif도 한 덩어리로 표시 — 합친 채 유지)

## 3. 데이터 모델 변경

### 3.1 `CharacterCollection` 컬럼 추가

```prisma
model CharacterCollection {
  // ...기존...
  coverImageUrl  String   @default("")   // 작품 상세 대형 커버 (whif universe.imageUrl)
  description    String   @default("")   // "작품 설정" 본문 (whif universe.description)
  tags           String[] @default([])   // 작품 태그 칩 (whif universe.tags)
}
```

- `Character`는 추가 컬럼 없음.
- 마이그레이션은 컬럼 추가만(ADD COLUMN, 기본값 보유)이라 기존 행에 안전. RENAME 없음 → constraint 충돌 우려 없음.
- 마이그레이션명 예: `add_collection_cover_description_tags`.

### 3.2 기존 데이터 백필

기존 whif 컬렉션은 새 컬럼이 비어 있다. 연결된 `Conversation`에 `scenarioDescription`/`tags`가, 소속 첫 캐릭터에 `avatarUrl`이 있으므로 일회성 백필:

- `collection.description` ← 연결 `conversation.scenarioDescription`
- `collection.tags` ← 연결 `conversation.tags`
- `collection.coverImageUrl` ← 소속 첫 캐릭터 `avatarUrl` (universe 이미지가 없을 때의 차선)

백필은 마이그레이션 직후 1회 실행 스크립트(`scripts/backfill-whif-collections.ts`)로 처리.

## 4. import 매핑 수정

`capture.ts`(`captureWhif`)는 이미 `universe.imageUrl`/`description`/`tags`를 확보한다. 현재는 일부만 `Conversation`으로 흘리고 컬렉션엔 안 넣는다.

### 4.1 `captureWhif` — assembledResult에 커버 추가

```ts
const assembledResult = {
  characters,
  scenarioDescription: universe.description || '',
  tags: universe.tags || [],
  title: universe.name || mainChar.name || '캐릭터',
  safetyLevel,
  coverImageUrl: universe.imageUrl || mainChar.avatarUrl || '',  // 추가
}
```

(`AssembledResult`/`Captured` 타입에 `coverImageUrl?: string` 추가)

### 4.2 import route — 컬렉션 생성 시 매핑

`apps/web/app/api/characters/import/route.ts`의 `prisma.characterCollection.create`:

```ts
const collection = await prisma.characterCollection.create({
  data: {
    title: collectionTitle,
    sourceUrl: url,
    userId,
    conversationId: conversation.id,
    coverImageUrl: result.coverImageUrl ?? '',     // 추가
    description: result.scenarioDescription ?? '', // 추가 (Conversation과 동일 값)
    tags: result.tags ?? [],                       // 추가
  },
})
```

- Zeta/Melting import도 같은 경로를 타므로, `coverImageUrl`은 없으면 `''`로 안전 처리.

## 5. API 변경

### 5.1 `GET /api/collections` — select 확장

새 컬럼 반환 + 화면에서 캐릭터 수/썸네일을 매기 쉽도록 소속 캐릭터 요약 포함:

```ts
select: {
  id: true, title: true, sourceUrl: true, createdAt: true,
  coverImageUrl: true, description: true, tags: true,
  characters: { select: { id: true, name: true, avatarUrl: true } },
}
```

### 5.2 작품 상세 데이터

- 기존 `GET /api/collections`(목록) 결과에서 단건 선택으로 충분. 별도 단건 엔드포인트는 만들지 않음(YAGNI).
- 로어북(백과사전)은 기존 `GET /api/lorebooks?collectionId=` 재사용.
- 소속 캐릭터는 기존 `GET /api/characters?isWhif=true`에서 `collection.id`로 필터.

### 5.3 캐릭터 상세 데이터

- 기존 `GET /api/characters?isWhif=true` 결과에 `additionalInfo`, `openingMessages`, `tags`, `safetyLevel`, `avatarUrl`이 모두 포함되어 단건 선택으로 충분.

> API는 **컬럼/Select 확장만** 하고 신규 엔드포인트는 추가하지 않는다.

## 6. 화면 아키텍처 (몰입형)

### 6.1 라우트 그룹 분리

기존 `app/(main)/whif/page.tsx`를 폐기하고 신규 라우트 그룹 `app/(whif)/`로 이전:

```
app/(whif)/layout.tsx              # 다크 몰입형 셸 (Win/Dock 없음, 하단 탭바 자체 제공)
app/(whif)/whif/page.tsx           # 탐색(홈)
app/(whif)/whif/universes/[id]/page.tsx   # 작품 상세
app/(whif)/whif/characters/[id]/page.tsx  # 캐릭터 상세
```

- `(whif)` 레이아웃은 `(main)`의 Win 셸/Dock을 쓰지 않고, 자체 다크 헤더 + 하단 탭바(또는 뒤로가기 헤더)를 렌더.
- 인증 가드는 `(main)`과 동일하게 `getAccessToken()` 체크 후 미인증 시 `/login`.
- `(main)` Dock의 "🪐 WHIF" 탭은 `/whif`로 이동(그룹은 URL에 안 드러나므로 경로 동일).

### 6.2 다크 테마 토큰 (스코프 한정)

전역 라이트 테마를 건드리지 않도록 `.whif-root`에만 변수 오버라이드:

```css
.whif-root {
  --w-bg: #0d0d0d;
  --w-surface: #17171c;
  --w-surface-2: #202028;
  --w-line: #2a2a33;
  --w-ink: #f2f2f5;
  --w-ink-soft: #a0a0ad;
  --w-accent: #8b5cf6;   /* 퍼플 포인트 */
  --w-accent-2: #7c3aed;
  --w-radius: 12px;
  background: var(--w-bg);
  color: var(--w-ink);
}
```

- 신규 스타일은 `globals.css` 하단에 `.whif-*` 네임스페이스로 추가(기존 클래스 재사용 금지 — 라이트 테마 오염 방지).
- 폰트는 기존 Pretendard 그대로.

## 7. 화면 명세

### 7.1 탐색(홈) — `/whif`

whif 홈 구조를 차용하되, 우리 데이터(가져온 작품·캐릭터)에 맞춤:

- **상단 헤더**: 좌측 `WHIF` 로고 텍스트, 우측 ⋮ 관리 메뉴(아래 8장).
- **탭**: `캐릭터` / `작품` (whif의 랭킹/작품 탭 차용, 우리는 2탭).
  - `작품` 탭: 작품 카드 그리드 — 카드 = 커버(`coverImageUrl`, 없으면 첫 캐릭터 아바타) + 제목 + `N명` + 태그 일부. 탭 시 작품 상세로.
  - `캐릭터` 탭: 캐릭터 카드 그리드 — 카드 = 아바타 + 이름 + 소개 2줄 + 태그 칩. 탭 시 캐릭터 상세로.
- 빈 상태: "가져온 작품이 없습니다 — ⋮ 메뉴에서 WHIF URL로 가져오세요."
- 카드 그리드는 반응형(`grid-template-columns: repeat(auto-fill, minmax(...))`)으로 모바일 2열 / 데스크톱 다열.

### 7.2 작품(세계관) 상세 — `/whif/universes/[id]`

whif 작품 상세 레이아웃:

- **대형 커버**: `coverImageUrl` 풀폭, 좌상단 뒤로가기, 우상단 ⋮.
- **제목 + 태그 칩**(`tags`).
- **탭**: `작품 설정`(기본) — `description` 본문, 길면 "더보기" 접힘.
  - 댓글/공유된 픽션 탭은 **제외**(소셜 미사용).
- **캐릭터 섹션**: 소속 캐릭터 카드 리스트(아바타+이름+태그). 탭 시 캐릭터 상세로.
- **백과사전(설정 카드)**: 기존 로어북 목록을 카드로 표시(읽기 전용). 편집은 편집 모드에서만.
- 하단/상단에 "세계관 전체 대화" 진입(기존 그룹 대화 흐름 유지 — 2단계에서 재설계).

### 7.3 캐릭터 상세 — `/whif/characters/[id]`

whif 캐릭터 상세 레이아웃:

- **풀블리드 아바타**: 좌상단 뒤로가기, 우상단 ⋮.
- **이름 + 세이프/19금 배지**(`safetyLevel`이 `relaxed`면 19금 톤 배지).
- **태그 칩 2줄**(`tags`).
- **탭**: `캐릭터 설정`(기본) — "캐릭터 소개" = `additionalInfo` 본문(합친 채 그대로).
  - 댓글/공유된 픽션 탭 제외.
- **시작 상황(도입부) 칩**: `openingMessages`가 2개 이상이면 제목 칩들을 가로 나열, 선택 시 해당 도입부 `content` 미리보기 표시(날짜/장소 같은 메타는 본문에 포함된 그대로). 1개면 칩 없이 미리보기만.
- **하단 고정 바**: `채팅 하기`(퍼플) — 선택된 도입부 인덱스를 들고 기존 채팅 진입 흐름 호출.

## 8. 관리 기능 (⋮ 메뉴 / 편집 모드)

소비 UI를 깨끗하게 유지하고, 관리 동작은 격리:

- **탐색 헤더 ⋮**: `WHIF URL로 가져오기`(import 입력), `새 작품 만들기`, `편집 모드`.
- **편집 모드 토글**: 켜면 카드/상세에 수정·삭제·다중선택 삭제·로어북 추가/수정/삭제 버튼이 노출. 끄면 전부 숨김.
- import 진행/성공/실패 메시지는 토스트 또는 헤더 하단 배너로.
- 기존 페이지의 모든 CRUD 로직(컬렉션/캐릭터/로어북, 다중선택 삭제, 도입부 선택, 페르소나 모달)은 **기능 보존** — 단지 배치만 편집 모드/상세로 이동.

## 9. 반응형 (웹 + 모바일)

- 모든 화면 모바일 우선. `apps/mobile`은 배포 웹을 WebView로 띄우므로 별도 RN 작업 없음.
- 터치 타깃 ≥ 40px, 하단 고정 바는 safe-area 패딩 고려(`env(safe-area-inset-bottom)`).
- 커버/카드 이미지는 `object-fit: cover` + `aspect-ratio`로 레이아웃 안정화.

## 10. 작업 순서(예상)

1. Prisma 컬럼 추가 + 마이그레이션 + 백필 스크립트
2. `capture.ts`/`import/route.ts`/`collections` API 매핑·Select 확장
3. `(whif)` 라우트 그룹 + 다크 레이아웃 + 테마 토큰
4. 탐색 → 작품 상세 → 캐릭터 상세 순으로 화면 구현(기존 CRUD 로직 이식)
5. 편집 모드/⋮ 메뉴로 관리 기능 격리
6. 기존 `(main)/whif` 제거, Dock 링크 확인

## 11. 위험 요소

- **테마 오염**: `.whif-*` 네임스페이스 + 토큰 스코프로 차단. 기존 전역 클래스 재사용 금지.
- **백필 정확도**: universe 이미지가 원래 없던 기존 컬렉션은 첫 캐릭터 아바타로 대체(완전 동일 불가, 허용).
- **2단계 의존**: 1단계의 "채팅 하기"는 기존 흐름에 연결만 — 동작은 보장하되 외형은 2단계에서 통일.
