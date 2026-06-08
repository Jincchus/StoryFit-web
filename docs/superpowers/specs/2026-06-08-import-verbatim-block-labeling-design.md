# 캐릭터 가져오기 — 원문 보존 블록 라벨링 설계

작성일: 2026-06-08
대상: WHIF · 멜팅(melting.chat) · Zeta(zeta-ai.io) URL 가져오기
파일: `app/api/characters/import/route.ts` (+ 보조 모듈 신설)

## 문제

현재 가져오기는 사이트에서 추출한 텍스트 한 덩어리를 Gemini에 통째로 넘기고,
`additionalInfo`를 "자연스럽게 서술"하라고 시켜 캐릭터 필드 JSON을 통째로 받는다.
이 구조 때문에 세 가지 문제가 발생한다.

1. **내용 변형**: AI가 추출과 재서술을 동시에 하면서 원문을 paraphrase/요약한다.
2. **잘림**: 입력 12,000자 컷 + 출력 `maxOutputTokens: 4096` 컷 + DB 직전 `.slice()` 캡
   (additionalInfo 10000, exampleDialogues 20000, openingMessage 5000, scenario 5000) —
   긴 캐릭터는 이 중 하나에 반드시 걸린다.
3. **정리 실패**: 큰 덩어리를 통째로 넣고 통째로 받으니 구조화가 일관되지 않는다.

## 목표 / 비목표

**목표**
- 원문 **글자 그대로 보존** (재서술 금지). AI는 분류/라우팅만 한다.
- 입력·출력·DB 어디서도 **잘리지 않는다** (긴 캐릭터도 통째로 보존).
- **누락 0** — 분류 안 된 텍스트도 버리지 않는다.
- WHIF · 멜팅 · Zeta 세 경로에 동일 파이프라인 적용.

**비목표**
- 텍스트 품질 향상/윤문 (의도적으로 안 함 — 원문 보존이 우선).
- Tavern Card(PNG/JSON) 업로드 경로 변경 (그쪽은 이미 구조화 데이터라 무관).

## 핵심 아이디어

AI가 **긴 본문을 출력하지 않게** 한다. AI는 번호 매긴 블록을 받아
"**몇 번 블록이 어느 캐릭터의 어느 필드인지**" 라벨(짧은 id·인덱스)만 반환한다.
실제 본문은 우리가 **원본 블록에서 잘라 조립**하므로 변형·잘림이 구조적으로 불가능하다.

## 다중 캐릭터 정책 (하이브리드)

개수가 아니라 "**원문이 그 인물을 독립 항목으로 따로 서술했는지**"로 나눈다.
- AI가 독립적으로 서술된 캐릭터 목록을 식별 (1명일 수도, 다중 주인공 여러 명일 수도).
- 특정 캐릭터에 명확히 귀속되는 블록 → 그 캐릭터의 필드에 verbatim (다중 주인공이면 각자 카드).
- 귀속이 애매하거나 세계관·줄거리 공용 블록 → 시나리오(또는 대표 캐릭터 additionalInfo).
- 억지로 쪼개지 않는다. 조연이 설정 안에서만 언급되면 그대로 시나리오에 보존.

결과: 단일 주인공 → 캐릭터 1개 + 시나리오 / 다중 주인공 → 각자 verbatim 카드(multiStory) /
조연 언급 → 시나리오에 통째로 보존.

## 파이프라인

```
URL → ①캡처 → ②블록 분할 → ③AI 분류(라벨만) → ④원문에서 조립 → ⑤검증/폴백 → 저장
```

### ① 캡처 (사이트별)
사이트별 추출은 유지하되, 텍스트를 한 덩어리로 뭉치지 않고 **라벨된 섹션 배열**로 반환한다.

```ts
interface CapturedSection { tab: string | null; text: string }  // text는 원본 그대로
interface Captured {
  sections: CapturedSection[]
  title: string          // ogTitle / 휴리스틱
  imageUrl: string        // og:image / plot 이미지
  loreUrls?: { url: string; name: string }[]  // Zeta 전용
}
```

- **멜팅**: `renderMeltingPageText`를 수정해 `첫 장면`/`상세 설명` 탭을 `\n---\n`로 합치지 말고
  `[{tab:'상세 설명', text}, {tab:'첫 장면', text}]`로 반환. 탭 라벨이 강한 힌트가 된다.
  세션 게이트/시드 쿠키 복구 로직은 그대로.
- **WHIF**: `renderWhifPageText` 결과(DOM innerText)를 `[{tab:null, text}]` 한 섹션으로.
  로그인 게이트 문구 판별은 그대로.
- **Zeta**: 현재 `preprocessZetaText`/`extractZetaIntroText` 결과를 활용해
  `[{tab:'인트로', text:intro}, {tab:null, text:body}]` 형태로. flight 데이터 추출은 유지.

### ② 블록 분할
```ts
interface Block { id: number; text: string; tabHint: string | null }
```
- 각 섹션 text를 빈 줄/문단 경계로 분할.
- 최소 길이(약 40자) 미만 조각은 직전 블록에 병합해 노이즈 제거.
- 전역 번호 부여(B0..Bn), 출처 탭 힌트 부착.
- `block.text`는 **원본 부분문자열 그대로** (조립 시 이걸 쓴다).

### ③ AI 분류 호출
- 입력: 번호 매긴 블록 목록(각 블록에 `[tab힌트]` 표시) + 분류 지시.
- 시스템 지시 핵심: "텍스트를 **복사하거나 다시 쓰지 마라**. 오직 블록 id와 라벨만 출력하라."
- 출력 스키마:
```json
{
  "title": "작품/주인공 제목",
  "tags": ["태그1", "태그2"],
  "characters": [{ "index": 0, "name": "이름", "gender": "남성|여성|" }],
  "blocks": [
    { "id": 0, "owner": 0, "field": "additionalInfo" },
    { "id": 1, "owner": 0, "field": "openingMessage" },
    { "id": 2, "owner": null, "field": "scenario" }
  ]
}
```
- `owner`: 캐릭터 index 또는 `null`(공용/시나리오).
- `field`: `additionalInfo | openingMessage | exampleDialogues | scenario | ignore`.
- 출력이 작으므로 `maxOutputTokens`는 분류 규모에 맞게(예: 2048) 두되 본문과 무관.
- 입력 캡(현재 12,000자)은 출력이 작아진 만큼 넉넉히 상향(예: 40,000자) — 캡처 본문이 길어도 분류 가능.
- 기존처럼 최대 2회 재시도 + `{...}` 추출 파싱.

### ④ 원문에서 조립 (verbatim)
- 캐릭터 index별로, 각 필드에 대해 `owner===idx && field===F`인 블록을 **원래 순서대로**
  `block.text`(원본)로 `\n\n` 결합. → 글자 그대로.
- `scenarioDescription` = `field==='scenario'` 블록 결합 (owner 무관).
- **멜팅/Zeta 탭 백스톱**: AI가 라벨을 누락한 블록 중
  - `tabHint==='첫 장면'|'인트로'` → 대표(0번) 캐릭터 `openingMessage`
  - `tabHint==='상세 설명'` → 대표 캐릭터 `additionalInfo`
- **누락 흡수**: 어떤 라벨에도 안 잡힌 블록 id → `scenarioDescription` 끝에 덧붙임 (누락 0).
- **길이 캡 제거**: `additionalInfo`/`exampleDialogues`/`openingMessage`/`scenarioDescription`의
  `.slice(...)` 가드를 제거한다. DB 컬럼은 모두 Prisma `String`(PostgreSQL `text`, 무제한)이라
  안전. 첫 메시지(Message.content)도 동일하게 통째 저장.

### ⑤ 검증 / 폴백
- **완전 실패 폴백**(AI 호출/파싱 2회 실패): 무손실 모드로 강등 —
  단일 캐릭터 생성, 이름은 `title`/휴리스틱, `additionalInfo` = 캡처 섹션 전체를 원문 그대로 결합,
  `첫 장면` 탭이 있으면 `openingMessage`로. 구조화는 포기하되 내용은 보존.
- **커버리지 체크**: 사용된 블록 글자수 합이 전체의 일정 비율 미만이면, 남은 블록을
  `scenarioDescription`에 떨궈 방어(로그 남김).
- **이름 없음**: 어떤 캐릭터 이름도 못 얻으면 `title`/`ogTitle`을 대표 이름으로 사용,
  그래도 없으면 기존처럼 오류 반환.

## 모듈 구조

라우트 파일이 이미 820줄로 크다. 가져오기 핵심 로직을 분리한다.

- `lib/import/capture.ts` — 사이트별 캡처: `captureMelting`, `captureWhif`, `captureZeta` →
  공통 `Captured` 반환. (헤드리스/쿠키/게이트 로직 이전)
- `lib/import/blocks.ts` — `splitIntoBlocks(sections): Block[]`.
- `lib/import/classify.ts` — `classifyBlocks(blocks, hints): Classification` (AI 호출 + 파싱 + 재시도).
- `lib/import/assemble.ts` — `assemble(blocks, classification): AssembledCharacters` (조립·백스톱·폴백·커버리지).
- `app/api/characters/import/route.ts` — 위 단계를 엮어 캐릭터/대화/컬렉션 생성(기존 DB 쓰기 로직 재사용).

각 모듈은 순수 함수에 가깝게(캡처 제외) 만들어 단위 테스트 가능하게 한다.

## 테스트

- `splitIntoBlocks`: 빈 줄 분할, 짧은 조각 병합, 탭 힌트 보존.
- `assemble`(순수 함수, AI 불필요):
  - 단일 캐릭터: 블록들이 필드별로 원문 그대로 결합되는지.
  - 다중 주인공: owner별 분리 + 각자 verbatim.
  - 누락 블록 흡수: 라벨 없는 블록이 scenario에 들어가는지.
  - 탭 백스톱: 첫 장면 → openingMessage.
  - **verbatim 보장**: 조립된 각 필드가 원본 텍스트의 부분문자열인지(부분문자열 검증).
  - 캡 없음: 10,000자 초과 입력이 안 잘리는지.
- 폴백: 분류 실패 시 전체 텍스트가 additionalInfo에 무손실로 들어가는지.
- 실제 URL 1~2개(WHIF/멜팅/Zeta)로 수동 E2E (브라우저 가져오기 → 결과 확인).

## 영향 범위 / 리스크

- 멜팅 캡처 반환형 변경 → 호출부(`importFromMelting`) 함께 수정.
- 길이 캡 제거로 매우 긴 캐릭터가 들어올 수 있음 → 토큰/렌더 비용 증가 가능(허용 범위로 판단).
- AI 오분류 가능성은 남지만, 누락 흡수·탭 백스톱·폴백으로 "최소한 내용은 보존"을 보장.
