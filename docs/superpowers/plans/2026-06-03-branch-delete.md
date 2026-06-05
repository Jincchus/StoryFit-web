# 분기(Branch) 삭제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분기 스위처 칩에서 분기(대화 복사본)를 삭제할 수 있게 하고, 삭제 후 버전이 자동으로 당겨지도록 한다.

**Architecture:** 백엔드 신규 없음 — 기존 `DELETE /api/conversations/[id]`(소유권 검증 + cascade) 재사용. `version`은 `/branches`가 매기는 파생값(위치 기반)이라 삭제 후 재조회만 하면 자동으로 당겨진다. 프론트(`page.tsx`)에서만 변경: 분기 목록 재조회 헬퍼 추출 + 삭제 핸들러 + 칩 UI에 `✕` 추가.

**Tech Stack:** Next.js 14, React(client component), TypeScript. **테스트 러너 없음** → 검증은 `npx tsc --noEmit` + `npm run build` + 수동 확인.

---

## 사전 메모

- 모든 변경은 한 파일: `app/(main)/conversations/[id]/page.tsx`.
- 이미 존재: `router`(`useRouter`, line 102), `branches`/`setBranches`(line 130), `BranchInfo` 타입(line 98 = `{ id, version, branchDescription, branchFromMessageId, rootConversationId }`), `setToast`(페이지 상태), `useCallback`(이미 import됨, `loadConv`에서 사용 중).
- 분기 스위처는 `branches.length > 1`일 때만 렌더 → 현재 분기를 삭제할 때 남는 분기가 항상 존재.
- `api.delete(path)`는 `@/lib/api`에서 제공.

---

### Task 1: 분기 목록 재조회 헬퍼 추출 + 삭제 핸들러

**Files:**
- Modify: `app/(main)/conversations/[id]/page.tsx`

- [ ] **Step 1: `loadBranches` useCallback로 추출** — 현재 (line 243~245):

```tsx
  useEffect(() => {
    api.get(`/api/conversations/${params.id}/branches`).then(setBranches).catch(() => {})
  }, [params.id])
```
를 다음으로 교체:
```tsx
  const loadBranches = useCallback(() => {
    api.get(`/api/conversations/${params.id}/branches`).then(setBranches).catch(() => {})
  }, [params.id])

  useEffect(() => { loadBranches() }, [loadBranches])
```

- [ ] **Step 2: 삭제 핸들러 추가** — 위 `useEffect(() => { loadBranches() }, [loadBranches])` 바로 아래에 추가:

```tsx
  const handleDeleteBranch = async (b: BranchInfo) => {
    if (!window.confirm(`v${b.version} 분기를 삭제할까요? 이 분기의 모든 메시지가 사라지며 되돌릴 수 없습니다.`)) return
    const isCurrent = b.id === params.id
    const fallback = branches.find(x => x.id !== b.id) // 삭제 후 남을 분기(스위처는 2개+일 때만 보이므로 항상 존재)
    try {
      await api.delete(`/api/conversations/${b.id}`)
      if (isCurrent) {
        if (fallback) router.push(`/conversations/${fallback.id}`)
        else router.push('/chatlist')
      } else {
        loadBranches()
      }
    } catch {
      setToast('분기 삭제에 실패했습니다')
    }
  }
```

- [ ] **Step 3: 타입체크**

Run: `cd /home/server/StoryFit/apps/web && npx tsc --noEmit 2>&1 | grep 'page.tsx' || echo OK`
Expected: `OK` (page.tsx 에러 없음). `handleDeleteBranch`가 아직 미사용이라 unused 경고는 ts에선 에러 아님 — 무시. (다음 Task에서 사용.)

- [ ] **Step 4: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add 'app/(main)/conversations/[id]/page.tsx'
git commit -m "feat(branch): add loadBranches refetch + handleDeleteBranch"
```

---

### Task 2: 분기 칩에 삭제(✕) UI

**Files:**
- Modify: `app/(main)/conversations/[id]/page.tsx`

- [ ] **Step 1: 스위처 칩 블록 교체** — 현재 (line 661~679):

```tsx
        {branches.length > 1 && (
          <div className="hstack" style={{ gap: 4, paddingBottom: 2, overflowX: 'auto', flexShrink: 0 }}>
            {branches.map(b => {
              const isCurrent = b.id === params.id
              return (
                <button
                  key={b.id}
                  className={`btn ${isCurrent ? 'primary' : 'ghost'}`}
                  style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}
                  title={b.branchDescription || undefined}
                  onClick={() => !isCurrent && router.push(`/conversations/${b.id}`)}
                >
                  v{b.version}{b.branchDescription ? ` · ${b.branchDescription}` : ''}
                </button>
              )
            })}
          </div>
        )}
```
를 다음으로 교체 (바깥 `<button>`을 `<div>`로 바꿔 내부에 삭제용 클릭 요소를 중첩 — 버튼 중첩 무효 HTML 방지):
```tsx
        {branches.length > 1 && (
          <div className="hstack" style={{ gap: 4, paddingBottom: 2, overflowX: 'auto', flexShrink: 0 }}>
            {branches.map(b => {
              const isCurrent = b.id === params.id
              return (
                <div
                  key={b.id}
                  className={`btn ${isCurrent ? 'primary' : 'ghost'}`}
                  style={{ fontSize: 10, padding: '2px 4px 2px 8px', flexShrink: 0, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    cursor: isCurrent ? 'default' : 'pointer' }}
                  title={b.branchDescription || undefined}
                  onClick={() => !isCurrent && router.push(`/conversations/${b.id}`)}
                >
                  <span>v{b.version}{b.branchDescription ? ` · ${b.branchDescription}` : ''}</span>
                  <span
                    role="button"
                    aria-label={`v${b.version} 분기 삭제`}
                    onClick={e => { e.stopPropagation(); handleDeleteBranch(b) }}
                    style={{ opacity: 0.55, padding: '0 2px', cursor: 'pointer' }}
                  >✕</span>
                </div>
              )
            })}
          </div>
        )}
```

- [ ] **Step 2: 타입체크 (전체)**

Run: `cd /home/server/StoryFit/apps/web && npx tsc --noEmit 2>&1 | tail -10`
Expected: 출력 없음(에러 없음).

- [ ] **Step 3: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add 'app/(main)/conversations/[id]/page.tsx'
git commit -m "feat(branch): delete (✕) button on branch switcher chips"
```

---

### Task 3: 검증 + 배포

**Files:** 없음 (검증·배포)

- [ ] **Step 1: 빌드**

Run: `cd /home/server/StoryFit/apps/web && npm run build 2>&1 | tail -20`
Expected: `Compiled successfully` / 에러 없음.

- [ ] **Step 2: 수동 확인** (배포 후 브라우저)
  - 분기가 2개 이상인 대화에서 상단 분기 칩에 `✕` 노출.
  - 다른(비현재) 분기 `✕` → confirm → 삭제 → 칩에서 사라지고 **버전이 당겨짐**(v3→v2 등), 현재 화면 유지.
  - 현재 분기 `✕` → confirm → 삭제 → 남은 분기로 이동.
  - 분기가 2개일 때 하나 삭제 → 1개 남아 스위처 사라짐(정상).

- [ ] **Step 3: 배포 (CLAUDE.md 2단계, DB 변경 없음)**

```bash
cd /home/server/StoryFit/apps/web && git push origin main
cd /home/server/StoryFit && git add apps/web && \
  git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (분기 삭제)" && git push origin master
# 서버: git pull origin master && git submodule update --remote apps/web && docker compose up --build -d
```
(이 단계는 별도 커밋 없음 — 배포 전용.)

---

## Self-Review (spec 대비)

- **삭제 범위 v1 포함 전부** → Task 2의 칩은 `isCurrent` 무관하게 모든 칩에 `✕` ✓
- **버전 자동 당겨짐** → 백엔드 파생값 + Task 1 `loadBranches` 재조회 ✓
- **확인창** → Task 1 `window.confirm` ✓
- **현재 분기 삭제 시 이동 / 비현재는 재조회** → Task 1 `handleDeleteBranch` 분기 처리 ✓
- **마지막 1개 보호** → 스위처 `branches.length > 1` 조건(기존) 유지 ✓
- 타입 일관성: `handleDeleteBranch(b: BranchInfo)` 정의(Task1)와 호출(Task2) 일치, `loadBranches` 정의/사용 일치 ✓
- 플레이스홀더: 없음 ✓
- 범위: 단일 파일, 요청3(원본 분기점 표시)은 제외(스펙대로) ✓
