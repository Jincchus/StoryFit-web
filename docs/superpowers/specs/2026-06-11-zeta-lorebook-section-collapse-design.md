# ZETA 작품 상세 로어북 섹션 기본 접힘 설계

**작성일:** 2026-06-11
**상태:** 승인됨

## 목표

ZETA 작품 상세 페이지(`(zeta)/zeta/plots/[id]/page.tsx`)의 "로어북 (N)" 섹션 자체를 기본 접힘 상태로 만들어, 로어북 항목이 많을 때 카드가 길어지는 것을 줄인다.

## 배경

- 현재 `(zeta)/zeta/plots/[id]/page.tsx:284-314`에서 `lorebooks.length > 0`이면 "로어북 (N)" 섹션이 항상 보이고, 그 아래 모든 로어북 항목이 목록으로 나열된다.
- 항목 각각은 `expandedLoreId` state로 개별 펼치기/접기가 이미 구현되어 있다(클릭 시 제목만 보이거나 내용까지 펼쳐짐).
- 그러나 항목이 많으면 접힌 제목 목록만으로도 페이지가 길어진다. 섹션 전체를 접을 수 있는 토글이 없다.
- 대화창(`(main)/conversations/[id]/page.tsx:1799-1803`)에는 동일한 패턴(`acc-toggle`/`acc-arrow`, 기본 접힘)이 이미 구현되어 있고 `globals.css:834-837`에 스타일이 정의되어 있다.

## 변경 사항

`(zeta)/zeta/plots/[id]/page.tsx`:

- `lorebookSectionOpen` state 추가 (기본값 `false`)
- 기존 `<h2 className="zeta-section-title">로어북 ({lorebooks.length})</h2>`을 `acc-toggle` 버튼으로 교체:
  ```tsx
  <button className="acc-toggle" onClick={() => setLorebookSectionOpen(o => !o)}>
    <span>로어북 ({lorebooks.length})</span>
    <span className={`acc-arrow ${lorebookSectionOpen ? 'open' : ''}`}>▼</span>
  </button>
  ```
- 항목 목록(`<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{lorebooks.map(...)}</div>`)은 `lorebookSectionOpen`이 `true`일 때만 렌더링
- 항목별 개별 펼치기/접기(`expandedLoreId`)는 변경 없음

## 영향 범위

- `(zeta)/zeta/plots/[id]/page.tsx`의 로어북 섹션 1곳만 수정
- WHIF 세계관 상세의 "백과사전" 섹션은 이번 변경에 포함하지 않음 (구조가 달라 별도 검토 필요)
- MELTING 상세에는 로어북 섹션이 없어 영향 없음
- 대화창의 로어북 패널(`(main)/conversations/[id]/page.tsx`)은 이미 동일 패턴으로 구현되어 있어 변경 없음

## 테스트

- UI 변경(상태 토글 + 조건부 렌더링)으로, 단위 테스트 대상인 순수 로직이 없음. `npx tsc --noEmit`으로 타입 체크만 확인하고, 코드 리뷰로 검증한다.

## 비목표 (Out of Scope)

- WHIF 세계관 상세 "백과사전" 섹션 접기 처리
- 로어북 항목별 펼치기/접기(`expandedLoreId`) 동작 변경
- 섹션 표시 순서 통일(별도 백로그 항목)
