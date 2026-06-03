# 분기(Branch) 삭제 — 설계 (확정)

> 작성: 2026-06-03 · 대상: `apps/web` · 상태: **설계 확정 · 구현 진행**
> 범위: 분기 삭제 기능만. (요청 3 "원본 분기점 표시"는 이 문서 하단에 별도 보류 메모로 유지.)

## 요청 요약

1. **분기 삭제 기능** 추가 (현재 없음).
2. v1~v4가 있을 때 **v2를 삭제하면 v3→v2, v4→v3로 버전이 당겨지도록**.
3. (추가) 분기를 만든 **원본 대화에서 "여기서 분기됨" 표시 + 그 분기로 바로 이동** — 확인/논의 중 중단.

---

## 핵심 구조 파악 (재조사 불필요)

- **분기 = 별도 Conversation 복사본.** 같은 `rootConversationId`를 공유하는 **평탄한 형제들**(중첩 아님). 분기 생성: `app/api/conversations/[id]/branch/route.ts` (메시지 0..branchFromMessageId 까지 새 id로 복사, `rootConversationId = source.rootConversationId ?? source.id`).
- **`version`은 저장값이 아니라 파생값(위치 기반).** `app/api/conversations/[id]/branches/route.ts` GET이 `(root + 모든 분기)`를 `createdAt asc`로 정렬해 `version = index + 1` 부여.
  - ⇒ **분기를 삭제하면 다음 `/branches` 조회 시 버전이 자동으로 당겨진다.** 요청 2번은 별도 구현 불필요 (공짜).
- **DELETE 엔드포인트 이미 존재:** `app/api/conversations/[id]/route.ts` → `DELETE` = `prisma.conversation.deleteMany({ where: { id, userId } })`. 메시지·메모리·로어북은 스키마에서 `onDelete: Cascade` → 함께 삭제됨.
- **`rootConversationId`는 단순 `String?`** (self-FK·cascade 없음). ⇒ **루트(v1)를 삭제해도 다른 분기가 연쇄 삭제되지 않음.** 남은 분기들은 `rootConversationId` 값으로 계속 그룹핑되어 v1,v2,…로 재번호됨(원본 행만 사라짐).
- **분기 스위처 UI:** `page.tsx:661–678` — `v{version}` 칩 가로줄. `branches.length > 1`일 때만 렌더 ⇒ 이 UI로는 **항상 최소 1개가 남음**(마지막 1개는 못 지움; 그건 채팅목록 삭제의 몫).
- **분기점 표시 + 이동 (이미 구현됨):** `page.tsx:716–733` — `branchesFromHere = branches.filter(b => b.branchFromMessageId === m.id && b.id !== params.id)`. 분기를 만든 메시지 **바로 위**에 `⑂ v{version} · 설명` 버튼이 뜨고, 클릭 시 `router.push(/conversations/{b.id})`로 그 분기로 점프. → 요청 3번이 이미 동작할 가능성 높음.

---

## 확정된 설계

- **삭제 범위:** v1(루트) 포함 **전부 삭제 가능**. 삭제 시 버전 자동으로 당겨짐(파생값이라 공짜).
- **삭제 UI:** 분기 스위처 칩(`page.tsx:661–678`)의 각 `v{N} · 설명` 칩 **오른쪽 끝에 작은 `✕`** 추가. 칩 본체 클릭 = 기존대로 그 분기로 이동 / `✕` 클릭 = 삭제(`e.stopPropagation()`). **모든 칩에** `✕`.
- **확인:** `window.confirm("v{N} 분기를 삭제할까요? 이 분기의 모든 메시지가 사라지며 되돌릴 수 없습니다.")`.
- **삭제 호출:** 기존 `api.delete('/api/conversations/{대상id}')` 재사용 (백엔드 신규 없음).
- **삭제 후 동작:**
  - 현재 보던 분기를 삭제한 경우 → 갱신된 분기 목록을 받아 **첫 번째 남은 분기로 이동**(`router.push`).
  - 다른 분기를 삭제한 경우 → 분기 목록만 재조회(`loadBranches`)로 칩·버전 갱신, 현재 화면 유지.
- **재조회 헬퍼:** 현재 분기 로드는 1회뿐(`page.tsx:244`)이므로 `loadBranches()` 콜백으로 추출해 재사용.
- 분기 스위처는 2개 이상일 때만 렌더 → **마지막 1개는 이 UI에서 안 지워짐**(고아 0개 없음).

## 보류 메모 — 요청 3 (원본 분기점 표시), 이번 범위 제외

- `page.tsx:716–733`에 이미 구현돼 있음(`⑂ v{n}` 점프 버튼). 화면에서 실제로 보이는지 사용자 미확인 상태.
- 재개 시: 분기 생성 후 원본 분기점 메시지 위에 `⑂ v{n}`가 뜨는지 검증 → 안 뜨면 버그(페이지네이션/매칭) 디버깅, 뜨면 (선택) 라벨 강조만.

---

## 구현 스케치 (재개 시 출발점)

1. **백엔드:** 신규 작업 거의 없음. 기존 `DELETE /api/conversations/[id]` 재사용. (분기 전용 검증이 필요하면 별도 가드 추가 검토.)
2. **프론트(`page.tsx`):**
   - 분기 스위처 칩에 삭제(`✕`) 추가 → `window.confirm` → `api.delete('/api/conversations/{b.id}')`.
   - 삭제 성공 후: 현재 분기였으면 남은 분기로 이동, 아니면 `getBranches()` 재조회로 칩/버전 갱신.
   - 분기 목록 재조회 함수가 이미 있음(`api.get('/api/conversations/{id}/branches')`, `page.tsx:244`).
3. **요청 3:** 먼저 현행 동작 검증 후 분기(버그 수정 / 강화 / 불필요) 결정.

## 배포 주의

- 이 변경은 `apps/web` 서브모듈 → CLAUDE.md의 2단계 push(서브모듈 main → 부모 master) + 서버 `docker compose up --build -d`. (DB 스키마 변경 없음 → db push 불필요.)
