# 기능 가이드 페이지 + 챕터(자동 분권) 기능 정상화

## 배경

StoryFit에는 슬래시 커맨드(`!상태창` 등), 스탯/인벤토리, 스타일 설정, 분기/형제메시지,
장기 메모리, 로어북, 서재(완결) 등 대화를 풍부하게 해주는 기능이 다수 존재하지만,
이를 한눈에 정리해 보여주는 곳이 없어 사용자가 기능을 잘 발견하지 못한다.

또한 조사 과정에서 "AI가 장면 전환을 감지해 챕터(N장)를 자동으로 나눠주는 기능"이
이미 코드에 존재하지만 사실상 작동하지 않는 상태임을 확인했다:

- `lib/storyEval.ts`의 `triggerStateTracking()`에만 `newChapter` 감지 로직이 있는데,
  이 함수는 **롤플레이/소설 모드에서만** 호출된다 (`chat/route.ts`에서 story/multiStory가
  아닐 때만 호출).
- "N장" 뱃지는 `conv.suggestRepliesEnabled`가 true일 때만 표시되는데, 이 값은
  **MELTING에서 들여온 캐릭터의 story 모드 대화에서만** 자동으로 true가 된다.
- story/multiStory 모드에서 호출되는 `evalStory()`에는 `newChapter` 감지 로직이 없다.

즉 챕터가 증가할 수 있는 조건(롤플레이/소설)과 뱃지가 표시되는 조건(story +
suggestRepliesEnabled)이 서로 어긋나 있어 사실상 죽은 기능이다.

이번 작업은 두 가지로 구성된다:
1. 챕터(자동 분권) 기능을 정상 작동하도록 수정하고, 사용자가 켜고 끌 수 있는 토글을 제공한다.
2. 정상화된 챕터 기능을 포함해, 대화를 풍부하게 만드는 기능들을 정리한 `/guide` 페이지를 만든다.
3. 앞으로 추가되는 사용자 대면 기능을 `/guide`에 계속 반영하도록 CLAUDE.md에 규칙을 추가한다.

---

## 1. 챕터(자동 분권) 기능 정상화

### 스키마 변경

`prisma/schema.prisma`의 `Conversation` 모델에 필드 추가:

```prisma
model Conversation {
  // ...기존 필드...
  autoChapterEnabled  Boolean  @default(false)
  // ...
}
```

이 프로젝트는 `prisma/migrations` 폴더 없이 `prisma db push`로 스키마를 적용한다.
필드 추가 후 `npx prisma db push` + `npx prisma generate` 실행.

### 백엔드 로직

**`lib/storyEval.ts`**

- `evalStory()` (story/multiStory에서 사용)의 프롬프트에 `newChapter` 필드를 추가한다.
  `triggerStateTracking()`에서 사용 중인 것과 동일한 기준 문구를 재사용한다:
  > "newChapter: 장소·시간대가 근본적으로 전환(큰 시간 점프 또는 완전히 새로운
  > 장소/상황으로 이동)됐을 때만 true, 아니면 false"
- `StoryEvalResult`에 `newChapter: boolean` 추가, `evalStory()` 반환값에 포함.
- `applyEval()`은 `opts.autoChapterEnabled && result.newChapter`일 때
  `prisma.conversation.update({ data: { chapter: { increment: 1 } } })`를 추가 update로 포함한다.
- `StoryEvalOptions`에 `autoChapterEnabled: boolean` 추가.
- `triggerStateTracking()`은 기존 `newChapter` 감지 로직을 유지하되,
  새 파라미터 `autoChapterEnabled: boolean`을 받아 `false`이면 `data.chapter` 갱신을 건너뛴다
  (statusTimeline 갱신은 그대로 유지).

**`app/api/conversations/[id]/chat/route.ts`**

- `triggerStoryEvaluation(...)` 호출 시 `autoChapterEnabled: conv.autoChapterEnabled` 전달.
- `triggerStateTracking(...)` 호출 시 `conv.autoChapterEnabled` 인자 추가 전달.

**`app/api/conversations/route.ts` (POST)**

- `autoChapterEnabled: body.autoChapterEnabled ?? false`를 `prisma.conversation.create`의
  `data`에 추가.

**`app/api/conversations/[id]/route.ts` (PATCH)**

- 기존 PATCH가 임의 필드 업데이트를 허용하는 방식이면 `autoChapterEnabled`도
  화이트리스트에 포함시켜 설정 탭에서 토글 변경이 저장되도록 한다.

### UI

**`app/(main)/conversations/new/page.tsx`**

- "🔖 AI 자동 챕터 구분" 토글 추가 (기존 `inventoryEnabled` 토글과 동일한 스위치 UI 패턴).
  - 위치: 스타일 설정 섹션 부근 (모드 제한 없이 모든 모드에 노출 — 롤플레이/소설/스토리 공통 기능)
  - 설명 문구: "AI가 장면이 크게 전환될 때(시간/장소 변화) 자동으로 챕터를 나눠줍니다."
  - state: `const [autoChapterEnabled, setAutoChapterEnabled] = useState(false)`
  - POST body에 `autoChapterEnabled` 포함.

**`app/(main)/conversations/[id]/page.tsx` (설정 탭)**

- 동일한 토글을 설정 탭에 추가, 변경 시 `PATCH /api/conversations/{id}`로
  `{ autoChapterEnabled }` 저장 (다른 토글형 설정과 동일한 즉시 저장 패턴 따름).

**뱃지 표시 조건 변경**

- `app/(main)/conversations/[id]/page.tsx:898-899`와
  `app/(main)/chatlist/page.tsx:358-360`의 뱃지 표시 조건을
  `conv.suggestRepliesEnabled && (conv.chapter ?? 1) > 0`
  →
  `conv.autoChapterEnabled && (conv.chapter ?? 1) > 1`
  로 변경한다 (1장일 때는 굳이 뱃지를 보여주지 않고, 실제로 챕터가 넘어갔을 때만 표시).
- `suggestRepliesEnabled`는 "추천 답장" 기능 전용으로 그대로 둔다 (이번 변경과 무관).

### 타입

- `Conversation` 관련 TS 타입(있다면 `types/index.ts` 등)에 `autoChapterEnabled?: boolean` 추가.

---

## 2. `/guide` 기능 가이드 페이지

### 라우트 및 진입점

- 새 라우트: `app/(main)/guide/page.tsx`
- 기존 `Win` 컴포넌트(`@/components/ui/Win`)로 감싸 다른 `(main)` 페이지와 통일된 톤 유지.
- 진입점:
  - `app/(main)/page.tsx`의 `BASE_ICONS` 배열에 `{ label: '기능 가이드', emoji: '📖', href: '/guide' }` 추가.
  - `app/(main)/settings/page.tsx`에 "📖 기능 가이드" 링크(버튼 또는 행) 추가 — 페이지 상단 또는
    기존 메뉴 목록 스타일에 맞춰 배치.

### 콘텐츠 구조

`app/(main)/guide/page.tsx` 내부에 데이터 배열을 정의한다 (홈 화면 `GUIDE_SECTIONS`와
동일한 타입 모양, 별도 export는 하지 않고 이 파일에 로컬로 둔다):

```ts
type FeatureItem = { emoji: string; label: string; desc: string }
type FeatureSection = { title: string; items: FeatureItem[] }

const FEATURE_SECTIONS: FeatureSection[] = [ ... ]
```

섹션 및 항목 (초기 데이터):

1. **🎮 대화 모드**
   - 📖 스토리: AI가 장면을 서술하고 선택지를 제시하는 인터랙티브 소설 모드
   - 👥 멀티스토리: 여러 캐릭터가 함께 이야기 속에서 상호작용
   - 💬 자유 대화 (티키타카): 선택지 없이 여러 캐릭터가 소설식으로 번갈아 대화
   - ✍ 소설: 노벨체로 서술되는 1인 대화 모드

2. **🎭 페르소나 (내 역할)**
   - 대화 설정에서 내가 연기할 캐릭터를 지정하면, 사용자 메시지가 해당 캐릭터로 표시되고
     시스템 프롬프트에도 페르소나 정보가 반영됨

3. **⚙️ 대화 설정**
   - 스타일 설정 (시점/시제/분위기/문체/응답 길이/전개 속도) — 대화 톤을 세밀하게 조정
   - 관계·능력치 스탯 — 호감도 등 수치를 AI가 대화에 따라 자동 조정, `!스탯`으로 조회
   - 인벤토리 — AI가 아이템 획득/소모를 자동 판단, `!인벤토리`로 조회
   - 🔖 AI 자동 챕터 구분 — 장면이 크게 전환되면 자동으로 챕터(N장)를 나눠 표시
   - 안전 수준 — 폭력/성인 표현 허용 정도 (엄격/표준/완화)

4. **🎛 고급 AI 파라미터**
   - 창의성(temperature) — 낮을수록 일관적, 높을수록 창의적
   - 반복 억제(frequency penalty) — 같은 표현 반복을 줄임
   - 응답 최대 길이 — AI 응답의 최대 토큰 수
   - 사고 예산(thinking budget) — 응답 전 내부 추론 깊이 (높을수록 응답이 느려질 수 있음)

5. **💬 슬래시 커맨드**
   - `!상태창` (`!정보`) — 스탯·인벤토리·현재 상황을 한번에 표시
   - `!스탯` (`!호감도`, `!관계`) — 관계/능력치 스탯만 표시
   - `!인벤토리` (`!소지품`) — 소지 아이템 목록 표시
   - `!상황` (`!타임라인`, `!씬`) — 현재 장면의 시간/장소/상황 요약
   - `!도움말` (`!명령어`) — 명령어 목록 표시
   - 안내: "채팅창에 입력하면 AI 비용 없이 즉시 결과를 볼 수 있습니다."

6. **🧠 메모리 & 로어북**
   - 핵심 메모리 — AI가 절대 잊으면 안 되는 설정/사실, 설정 탭에서 직접 편집
   - 타임라인 상태 — 현재 장면의 시간/장소/상황 요약, 직접 편집 가능
   - 장기 메모리 — 대화가 길어지면 자동 요약되며, 선택해서 핵심 메모리로 승격 가능
   - 로어북 — 키워드 등장 시 관련 설정을 AI에게 자동 주입, 설정 탭에서 직접 추가/수정/삭제

7. **🌿 분기 & 메시지 조작**
   - 분기(Branch) — 메시지 우클릭 → 해당 지점에서 새 타임라인 분기 생성, 상단 탭으로 전환
   - 형제 메시지 — 같은 지점에서 재생성된 다른 응답들 사이를 전환
   - 메시지 수정 — 사용자 메시지 수정 시 이후 대화 재생성, AI 메시지 수정은 내용만 변경
   - 재생성(Regenerate) — 마지막 AI 응답을 다시 생성 (스탯/인벤토리 변화 자동 롤백)

8. **📚 정리 기능**
   - 서재 — 완결된 대화를 보관, `/library`에서 모아보기, "꺼내기"로 채팅 목록 복귀
   - 핀 고정 — 자주 쓰는 대화를 채팅 목록 상단에 고정
   - 챕터 뱃지 — 자동 챕터 구분이 켜진 대화에서 진행 중인 장(N장) 표시

### 페이지 구성

- 섹션별 아코디언(클릭 시 펼침/접힘), 기본은 모두 접힘 또는 첫 섹션만 펼침 (구현 시 결정).
- 각 항목은 `이모지 + label(굵게) + desc(설명)` 형태로 렌더 — 홈 화면 가이드 모달의
  항목 렌더링 스타일을 재사용.
- 외부 링크나 페이지 이동은 포함하지 않는다 (정적 정보 제공 목적, YAGNI).

---

## 3. CLAUDE.md 갱신 규칙

`C:\StoryFit\CLAUDE.md`의 "Rules (always follow)" 섹션에 다음 규칙을 추가한다:

> **사용자 기능 가이드 동기화**: 사용자가 체감할 수 있는 새 기능이나 설정을 추가/변경하면,
> `apps/web/app/(main)/guide/page.tsx`의 `FEATURE_SECTIONS`에도 해당 항목을 함께 추가/수정한다.

---

## 테스트 / 검증

- 기존 `vitest` 스위트 통과 확인 (`npx vitest run`)
- `npx tsc --noEmit` 통과 확인
- `lib/storyEval.ts`의 `evalStory`/`applyEval`에 대한 단위 테스트가 있다면 `newChapter` 케이스 추가
  (없다면 스킵 — 기존 테스트 스타일을 따름)
- `/guide` 페이지는 정적 콘텐츠이므로 빌드 통과 + 수동 확인으로 충분

## 배포

기존 컨벤션대로 2단계 배포:
1. `apps/web` main 브랜치에 커밋 + push
2. 루트 저장소 master 브랜치에 서브모듈 포인터 업데이트 커밋 + push
