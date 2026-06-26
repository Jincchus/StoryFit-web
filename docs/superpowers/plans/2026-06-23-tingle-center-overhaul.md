# Tingle Center Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tingle 센터를 WHIF 방식으로 개편 — 캐릭터/서사/테마 주탭, 미리보기 모달 제거(직접 가져오기), JSON 전체 필드 수집, 서사/테마 세계관 등록 체크박스, 선택된 서사/테마 로어북 채팅방 자동 복제.

**Architecture:** 6개 파일 수정. (1) `types.ts` + `capture.ts`에 lorebooks 필드 및 누락 필드 추가. (2) `conversations/route.ts`에 `extraCollectionIds` 파라미터 추가. (3) `tingle/page.tsx` 탭 구조 개편 + 직접 가져오기. (4) 세 디테일 페이지에 삭제·세계관 등록 UI 추가.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, React

## Global Constraints

- 시스템 프롬프트 조립 순서 고정 (`static prefix → volatile tail`) — `scenarioDescription`은 static 영역
- 로어북 토큰 상한: 우선순위 내림차순, 누적 1,000 토큰 초과 시 제외
- 팅글 캐릭터는 `/chat/characters/`, 서사는 `/chat/universes/`, 테마는 `/chat/scenes/` URL 패턴으로 구분
- `replaceDisplayPlaceholders(text, userName, charNames)` — 화면에 렌더링하는 모든 텍스트 필드에 필수 적용
- AI 키는 서버 전용 (API Route 내에서만 사용)
- `apps/web` 파일 수정 후 배포는 두 단계: submodule 커밋 → parent repo 커밋

---

## File Map

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `lib/import/types.ts` | Modify | `TingleRawData`에 `lorebooks?` 필드 추가 |
| `lib/import/capture.ts` | Modify | `captureTingleRaw` — 서사 worldBooks, 캐릭터 firstMessage 폴백, catch-all 필드 추가 |
| `app/api/characters/import/route.ts` | Modify | `buildCapturedFromPreview`에 lorebooks 전달 로직 추가 |
| `app/api/conversations/route.ts` | Modify | `extraCollectionIds` 파라미터 추가 → 서사/테마 로어북도 복제 |
| `app/(tingle)/tingle/page.tsx` | Modify | 탭 구조 개편 + 미리보기 모달 제거 + 직접 가져오기 |
| `app/(tingle)/tingle/characters/[id]/page.tsx` | Modify | 삭제 버튼 + extraCollectionIds 전달 |
| `app/(tingle)/tingle/universes/[id]/page.tsx` | Modify | 삭제 버튼 + 세계관 등록 UI + extraCollectionIds 전달 |
| `app/(tingle)/tingle/scenes/[id]/page.tsx` | Modify | 삭제 버튼 + 세계관 등록 UI + extraCollectionIds 전달 |

---

## Task 1: TingleRawData 타입 확장 + captureTingleRaw 완전화

**Files:**
- Modify: `apps/web/lib/import/types.ts`
- Modify: `apps/web/lib/import/capture.ts` (함수 `captureTingleRaw`, 라인 958~1023)

**Interfaces:**
- Produces: `TingleRawData.lorebooks?: { keyword: string[]; content: string; priority?: number }[]` (Task 3에서 사용)
- Produces: characters에 firstMessage 폴백, universes에 worldBooks → fields + lorebooks, 모든 타입에 catch-all 필드

- [ ] **Step 1: types.ts에 lorebooks 필드 추가**

`apps/web/lib/import/types.ts`의 `TingleRawData` 인터페이스를 수정:

```typescript
export interface TingleRawData {
  type: 'character' | 'universe' | 'scene'
  url: string
  name: string
  gender: string
  coverImageUrl: string
  tags: string[]
  safetyLevel: 'standard' | 'relaxed'
  fields: TingleField[]
  openings: TingleOpening[]
  linked?: TingleRawData[]
  isLinked?: boolean
  lorebooks?: { keyword: string[]; content: string; priority?: number }[]  // 추가
}
```

- [ ] **Step 2: captureTingleRaw — characters 섹션 보완**

`apps/web/lib/import/capture.ts`의 `captureTingleRaw` 함수 내 `if (type === 'characters')` 블록을 아래로 교체. 기존 코드(964~1001행)를 통째로 교체:

```typescript
  if (type === 'characters') {
    const fields: TingleField[] = []
    let order = 1
    if (data.introduction) fields.push({ key: 'introduction', label: '소개', value: data.introduction, order: order++ })
    if (data.age) fields.push({ key: 'age', label: '나이', value: `나이: ${data.age}세`, order: order++ })
    if (data.job) fields.push({ key: 'job', label: '직업', value: String(data.job), order: order++ })
    if (data.personality) fields.push({ key: 'personality', label: '성격', value: String(data.personality), order: order++ })
    if (data.speakingStyle) fields.push({ key: 'speakingStyle', label: '말투', value: String(data.speakingStyle), order: order++ })
    if (data.favorites) fields.push({ key: 'favorites', label: '좋아하는 것', value: String(data.favorites), order: order++ })
    if (data.characterDetails) fields.push({ key: 'characterDetails', label: '캐릭터 설정', value: String(data.characterDetails), order: order++ })
    if (data.backgroundDetails) fields.push({ key: 'backgroundDetails', label: '배경 설정', value: String(data.backgroundDetails), order: order++ })
    if (data.otherDetails) fields.push({ key: 'otherDetails', label: '기타 설명', value: String(data.otherDetails), order: order++ })
    if (data.creatorComment) fields.push({ key: 'creatorComment', label: '제작자 메모', value: `[제작자 메모]\n${data.creatorComment}`, order: order++ })

    // catch-all: 아직 처리되지 않은 알 수 없는 string 필드
    const knownCharKeys = new Set(['name', 'introduction', 'age', 'job', 'personality', 'speakingStyle',
      'favorites', 'characterDetails', 'backgroundDetails', 'otherDetails', 'creatorComment',
      'openings', 'gender', 'coverImages', 'tags', 'isAdult', 'universe', 'scene', 'id',
      'userId', 'createdAt', 'updatedAt', 'isHideAge', 'isHideJob', 'isHidePersonality',
      'isHideSpeakingStyle', 'isHideFavorites', 'isHideCharacterDetails', 'isHideBackgroundDetails',
      'firstMessage', 'displayOrder', 'likesCount', 'chatCount', 'isPublic', 'status'])
    for (const [key, value] of Object.entries(data)) {
      if (knownCharKeys.has(key)) continue
      if (typeof value !== 'string' || !value.trim()) continue
      fields.push({ key, label: key, value, order: order++ })
    }

    const rawOpenings = Array.isArray(data.openings) ? data.openings : []
    let openings = rawOpenings
      .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((o: any, idx: number) => ({
        id: String(o.id ?? `opening_${idx}`),
        title: String(o.title ?? (idx === 0 ? '기본 도입부' : `도입부 ${idx + 1}`)),
        content: String(o.content ?? ''),
      }))
      .filter((o: any) => o.content.trim().length > 0)

    // firstMessage 폴백: openings가 없을 때
    if (openings.length === 0 && data.firstMessage?.trim()) {
      openings = [{ id: 'first_message', title: '기본 도입부', content: data.firstMessage }]
    }

    // 연결된 서사/테마 자동 포함
    const linked: import('./types').TingleRawData[] = []
    if (data.universe?.id) {
      try {
        const uRaw = await captureTingleRaw(`https://tingle.chat/chat/universes/${data.universe.id}`)
        linked.push(uRaw)
      } catch {}
    }
    if (data.scene?.id) {
      try {
        const sRaw = await captureTingleRaw(`https://tingle.chat/chat/scenes/${data.scene.id}`)
        linked.push(sRaw)
      } catch {}
    }

    return { type: 'character', url, name: data.name ?? '캐릭터', gender: data.gender ?? '', coverImageUrl, tags, safetyLevel, fields, openings, ...(linked.length > 0 ? { linked } : {}) }
  }
```

- [ ] **Step 3: captureTingleRaw — universes 섹션 보완 (worldBooks + catch-all)**

`if (type === 'universes')` 블록(1003~1013행)을 교체:

```typescript
  if (type === 'universes') {
    const fields: TingleField[] = []
    let order = 1
    if (data.introduction) fields.push({ key: 'introduction', label: '소개', value: data.introduction, order: order++ })
    const relationships = Array.isArray(data.relationships) ? data.relationships : []
    const privateRelationships = Array.isArray(data.privateRelationships) ? data.privateRelationships : []
    const allRel = [...relationships, ...privateRelationships].filter(Boolean).join('\n')
    if (allRel) fields.push({ key: 'relationships', label: '관계 설정', value: allRel, order: order++ })

    // catch-all
    const knownUnivKeys = new Set(['name', 'introduction', 'relationships', 'privateRelationships',
      'worldBooks', 'coverImages', 'tags', 'isAdult', 'id', 'userId', 'createdAt', 'updatedAt',
      'likesCount', 'chatCount', 'isPublic', 'status'])
    for (const [key, value] of Object.entries(data)) {
      if (knownUnivKeys.has(key)) continue
      if (typeof value !== 'string' || !value.trim()) continue
      fields.push({ key, label: key, value, order: order++ })
    }

    // worldBooks → lorebooks
    const worldBooks = Array.isArray(data.worldBooks) ? data.worldBooks : []
    const loreEntries = worldBooks
      .map((wb: any) => ({
        keyword: [wb.keyword ?? wb.keywords ?? wb.name ?? ''].flat().filter(Boolean) as string[],
        content: String(wb.content ?? ''),
        priority: wb.priority ?? 0,
      }))
      .filter((wb) => wb.keyword.length > 0 && wb.content.trim())

    return {
      type: 'universe', url, name: data.name ?? '서사', gender: '', coverImageUrl, tags, safetyLevel, fields, openings: [],
      ...(loreEntries.length > 0 ? { lorebooks: loreEntries } : {}),
    }
  }
```

- [ ] **Step 4: captureTingleRaw — scenes 섹션 보완 (catch-all)**

`// scenes` 블록(1015~1023행)을 교체:

```typescript
  // scenes
  const fields: TingleField[] = []
  let order = 1
  if (data.introduction) fields.push({ key: 'introduction', label: '소개', value: data.introduction, order: order++ })
  if (data.timeFrame) fields.push({ key: 'timeFrame', label: '시간대', value: `[시간대] ${data.timeFrame}`, order: order++ })
  if (data.otherDetails) fields.push({ key: 'otherDetails', label: '기타 설명', value: data.otherDetails, order: order++ })

  // catch-all
  const knownSceneKeys = new Set(['name', 'introduction', 'timeFrame', 'otherDetails',
    'coverImages', 'tags', 'isAdult', 'id', 'userId', 'createdAt', 'updatedAt',
    'likesCount', 'chatCount', 'isPublic', 'status'])
  for (const [key, value] of Object.entries(data)) {
    if (knownSceneKeys.has(key)) continue
    if (typeof value !== 'string' || !value.trim()) continue
    fields.push({ key, label: key, value, order: order++ })
  }

  return { type: 'scene', url, name: data.name ?? '테마', gender: '', coverImageUrl, tags, safetyLevel, fields, openings: [] }
```

- [ ] **Step 5: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/import/types.ts lib/import/capture.ts
git commit -m "feat(tingle): captureTingleRaw 전체 필드 수집 — worldBooks lorebooks, firstMessage 폴백, catch-all"
```

---

## Task 2: buildCapturedFromPreview — lorebooks 전달

**Files:**
- Modify: `apps/web/app/api/characters/import/route.ts` (함수 `buildCapturedFromPreview`, 라인 59~98)

**Interfaces:**
- Consumes: `TingleRawData.lorebooks` (Task 1에서 추가)
- Produces: `Captured.lorebooks` 채워짐 → `runImport`의 lorebook 저장 로직이 동작

- [ ] **Step 1: buildCapturedFromPreview에 lorebooks 추가**

`apps/web/app/api/characters/import/route.ts`의 `buildCapturedFromPreview` 함수 마지막 부분(return 직전)을 수정:

현재:
```typescript
  return {
    sections: [],
    title: name,
    imageUrl: coverImageUrl,
    assembledResult: { ... },
  }
```

변경 후:
```typescript
  const captured: Captured = {
    sections: [],
    title: name,
    imageUrl: coverImageUrl,
    assembledResult: {
      title: name,
      characters: [{
        name,
        gender: gender ?? '',
        tags,
        additionalInfo,
        openingMessage,
        openingMessages: openingMessagesArr.length > 1 ? openingMessagesArr : undefined,
        exampleDialogues,
        avatarUrl: coverImageUrl || undefined,
      }],
      scenarioDescription: '',
      tags,
      safetyLevel,
      coverImageUrl,
    },
  }
  if (previewData.lorebooks?.length) {
    captured.lorebooks = previewData.lorebooks
  }
  return captured
```

- [ ] **Step 2: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add app/api/characters/import/route.ts
git commit -m "feat(tingle): buildCapturedFromPreview — lorebooks 전달 지원"
```

---

## Task 3: conversations API — extraCollectionIds 추가

**Files:**
- Modify: `apps/web/app/api/conversations/route.ts` (POST 핸들러, 라인 141~163)

**Interfaces:**
- Produces: `POST /api/conversations` body에 `extraCollectionIds?: string[]` 추가 — 이 컬렉션들의 로어북도 채팅방에 복제됨

- [ ] **Step 1: extraCollectionIds 파라미터 처리**

`apps/web/app/api/conversations/route.ts`에서 lorebook 복제 블록(141~163행)을 수정:

```typescript
  // Clone collection-level lorebooks to this conversation
  // extraCollectionIds: 선택된 서사/테마 컬렉션 ID (팅글 캐릭터 페이지에서 전달)
  const extraCollectionIds: string[] = Array.isArray(body.extraCollectionIds)
    ? body.extraCollectionIds.map(String).filter(Boolean)
    : []
  const allCollectionIds = Array.from(new Set([...collectionIds, ...extraCollectionIds]))

  if (allCollectionIds.length > 0) {
    const collectionLorebooks = await prisma.lorebook.findMany({
      where: { collectionId: { in: allCollectionIds } },
    })

    if (collectionLorebooks.length > 0) {
      await Promise.all(
        collectionLorebooks.map(lb =>
          prisma.lorebook.create({
            data: {
              keyword: lb.keyword,
              content: lb.content,
              priority: lb.priority,
              scanDepth: lb.scanDepth,
              conversationId: conversation.id,
            },
          })
        )
      )
    }
  }
```

- [ ] **Step 2: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add app/api/conversations/route.ts
git commit -m "feat(conversations): extraCollectionIds — 서사/테마 로어북 채팅방 자동 복제"
```

---

## Task 4: tingle/page.tsx — 탭 구조 개편 + 직접 가져오기

**Files:**
- Modify: `apps/web/app/(tingle)/tingle/page.tsx` (전체 파일)

**Interfaces:**
- Produces: `TypeTab = 'character' | 'universe' | 'scene'` (no 'all'), 주탭으로 승격
- Produces: `handleDirectImport(url: string)` — 미리보기 없이 직접 저장 + linked 자동 처리
- Produces: localStorage `tg_uni_${collectionId}`, `tg_scene_${collectionId}` 자동 설정

- [ ] **Step 1: 인터페이스/타입 수정 — TypeTab에서 'all' 제거**

파일 상단의 타입 선언:

```typescript
type ViewTab = 'active' | 'waiting' | 'completed' | 'favorites'
type TypeTab = 'character' | 'universe' | 'scene'  // 'all' 제거
```

- [ ] **Step 2: ImportPreviewModal 컴포넌트 전체 삭제**

`function ImportPreviewModal(...)` 컴포넌트(72~266행) 전체를 삭제. `PreviewItem` 인터페이스도 삭제.

- [ ] **Step 3: 상태 정리 — preview 관련 제거, typeTab 기본값 변경**

삭제할 상태들:
```typescript
// 삭제
const [confirming, setConfirming] = useState(false)
const [previews, setPreviews] = useState<TinglePreview[] | null>(null)
```

`typeTab` 초기값 변경:
```typescript
const [typeTab, setTypeTab] = useState<TypeTab>('character')
```

`useEffect` 내 sessionStorage 읽기 수정:
```typescript
const stored = sessionStorage.getItem('tg_type') as TypeTab
setTypeTab(stored === 'character' || stored === 'universe' || stored === 'scene' ? stored : 'character')
```

- [ ] **Step 4: importTingleUrl 헬퍼 추가**

컴포넌트 함수 안, fetchData 바로 아래에 추가:

```typescript
  const importTingleUrl = async (url: string) => {
    if (url.includes('tingle.chat')) {
      const previews: TinglePreview[] = await api.post('/api/characters/import/preview', { url })
      const main = previews.find(p => !p.isLinked)
      const linked = previews.filter(p => p.isLinked)
      if (!main) throw new Error('미리보기 데이터 없음')
      const mainResult = await api.post('/api/characters/import', { url: main.url, previewData: main })
      for (const item of linked) {
        const linkedResult = await api.post('/api/characters/import', { url: item.url, previewData: item })
        if (item.type === 'universe' && mainResult.collectionId) {
          localStorage.setItem(`tg_uni_${mainResult.collectionId}`, linkedResult.collectionId)
        }
        if (item.type === 'scene' && mainResult.collectionId) {
          localStorage.setItem(`tg_scene_${mainResult.collectionId}`, linkedResult.collectionId)
        }
      }
    } else {
      await api.post('/api/characters/import', { url })
    }
  }
```

- [ ] **Step 5: handlePreview + handleConfirm 제거 → handleDirectImport 추가**

`handlePreview`(319~342행)와 `handleConfirm`(344~363행) 전체 삭제.

대신 추가:

```typescript
  const handleDirectImport = async () => {
    const urls = importUrl.split('\n').map(u => u.trim()).filter(Boolean)
    if (urls.length === 0 || importing) return
    setImporting(true); setMsg('')
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < urls.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${urls.length})`)
      try {
        await importTingleUrl(urls[i])
        ok++
      } catch (e: any) {
        failed.push(urls[i])
        setMsg(`⚠ ${urls[i]} — ${e.message}`)
      }
    }
    setImporting(false)
    if (ok > 0) setImportUrl(failed.length > 0 ? importUrl : '')
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.join(', ')} 실패` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) setMenuOpen(false)
    await fetchData()
  }
```

- [ ] **Step 6: 좋아요 목록 handleLikedImport 수정**

기존 `handleLikedImport`(390~412행)를 교체:

```typescript
  const handleLikedImport = async () => {
    const targets = likedList.filter(x => likedSelected.has(x.id))
    if (targets.length === 0 || importing) return
    setImporting(true); setMsg('')
    let ok = 0
    const failed: string[] = []
    for (let i = 0; i < targets.length; i++) {
      setMsg(`가져오는 중... (${i + 1}/${targets.length})`)
      try {
        await importTingleUrl(targets[i].sourceUrl)
        ok++
      } catch {
        failed.push(targets[i].name)
      }
    }
    setImporting(false)
    setMsg(failed.length ? `✓ ${ok}개 완료 · ⚠ ${failed.join(', ')} 실패` : `✓ ${ok}개 가져왔습니다`)
    if (failed.length === 0) {
      setLikedPanel(false)
      setLikedSelected(new Set())
    }
    await fetchData()
  }
```

- [ ] **Step 7: 메뉴 버튼 텍스트 변경 + 핸들러 교체**

메뉴 내 버튼:
```typescript
<button
  className="tingle-menu-item"
  style={{ background: 'var(--tg-accent)', borderRadius: 8, color: '#fff', textAlign: 'center' }}
  disabled={importing}
  onClick={handleDirectImport}
>{importing ? '가져오는 중...' : '📥 가져오기'}</button>
```

- [ ] **Step 8: 탭 구조 변경 — 주탭(캐릭터/서사/테마) + 상태 탭**

현재 "상태 탭" + "타입 탭" 두 행을 아래 구조로 교체:

```tsx
      {/* 주탭: 캐릭터 / 서사 / 테마 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--tg-line)', padding: '0 16px' }}>
        {([
          { key: 'character', label: '캐릭터', color: '#ff5776' },
          { key: 'universe', label: '서사', color: '#a78bfa' },
          { key: 'scene', label: '테마', color: '#06bfd6' },
        ] as const).map(t => (
          <button key={t.key}
            style={{
              appearance: 'none', border: 'none', background: 'none', cursor: 'pointer',
              padding: '10px 16px', fontSize: 14, fontWeight: 700,
              color: typeTab === t.key ? t.color : 'var(--tg-ink-soft)',
              borderBottom: typeTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
              marginBottom: -1,
            }}
            onClick={() => handleTypeTab(t.key)}>
            {t.label}
            <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.6 }}>
              {typeCounts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* 상태 필터 + 검색/정렬 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {(['active', 'waiting', 'completed', 'favorites'] as const).map(v => (
            <button key={v} className="tingle-chip"
              style={{ cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
                background: view === v ? 'var(--tg-accent)' : 'var(--tg-surface-2)',
                color: view === v ? '#fff' : 'var(--tg-ink-soft)' }}
              onClick={() => handleView(v)}>
              {v === 'active' ? `진행 중 ${counts.active}`
                : v === 'waiting' ? `대기 ${counts.waiting}`
                : v === 'completed' ? `완결 ${counts.completed}`
                : '★ 즐겨찾기'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button className="tingle-chip"
            style={{ cursor: 'pointer', border: 'none',
              background: searchOpen ? 'var(--tg-accent)' : 'var(--tg-surface-2)',
              color: searchOpen ? '#fff' : 'var(--tg-ink-soft)' }}
            onClick={toggleSearch}>🔍</button>
          <select className="field" style={{ fontSize: 11, padding: '2px 6px', width: 'auto' }} value={sort} onChange={e => handleSort(e.target.value as SortOption)}>
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="alpha">가나다순</option>
            <option value="active">최근 대화순</option>
            <option value="random">🔀 랜덤</option>
          </select>
        </div>
      </div>
```

- [ ] **Step 9: visible 필터 수정 — typeTab 'all' 케이스 제거**

```typescript
  const visible = sortByOption(
    cols.filter(c => {
      const viewMatch = view === 'favorites' ? isFav('collection', c.id)
        : view === 'completed' ? c.completed
        : view === 'waiting' ? !c.started
        : !c.completed && !!c.started
      const typeMatch = detectTingleType(c.sourceUrl).type === typeTab
      return viewMatch && typeMatch && matchesQuery(c)
    }),
    sort, c => c.title, c => c.createdAt ?? '', c => c.lastActivityAt ?? c.createdAt ?? '', randomSeed
  )
```

- [ ] **Step 10: typeCounts 수정 — 'all' 제거**

```typescript
  const typeCounts = {
    character: cols.filter(c => detectTingleType(c.sourceUrl).type === 'character').length,
    universe: cols.filter(c => detectTingleType(c.sourceUrl).type === 'universe').length,
    scene: cols.filter(c => detectTingleType(c.sourceUrl).type === 'scene').length,
  }
```

- [ ] **Step 11: 빈 상태 메시지 수정 — type별 메시지 추가**

빈 상태일 때 메시지:
```typescript
          cols.length === 0
            ? `가져온 ${typeTab === 'character' ? '캐릭터' : typeTab === 'universe' ? '서사' : '테마'}가 없습니다.\n⋮ 메뉴에서 팅글 URL을 붙여넣고 📥 가져오기를 누르세요.\n(관리자 설정에서 인증 토큰 설정 필요)`
            : `진행 중인 ${typeTab === 'character' ? '캐릭터' : typeTab === 'universe' ? '서사' : '테마'}가 없습니다.`
```

- [ ] **Step 12: JSX에서 {previews && <ImportPreviewModal .../>} 블록 삭제**

리턴문 최상단의 `{previews && (...)}` 블록 전체 삭제.

- [ ] **Step 13: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add app/\(tingle\)/tingle/page.tsx
git commit -m "feat(tingle): 탭 구조 개편(캐릭터/서사/테마 주탭) + 미리보기 모달 제거 → 직접 가져오기 + localStorage 자동매핑"
```

---

## Task 5: tingle/characters/[id]/page.tsx — 삭제 버튼 + extraCollectionIds

**Files:**
- Modify: `apps/web/app/(tingle)/tingle/characters/[id]/page.tsx`

**Interfaces:**
- Consumes: `extraCollectionIds` (Task 3 — conversations API)
- Produces: 삭제 버튼, 대화 생성 시 선택된 서사/테마 로어북 자동 복제

- [ ] **Step 1: 삭제 상태 및 핸들러 추가**

`const [showEdit, setShowEdit] = useState(false)` 아래에 추가:

```typescript
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('이 항목을 삭제할까요?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/collections/${id}`)
      router.push('/tingle')
    } catch (e: any) {
      setDeleting(false)
    }
  }
```

- [ ] **Step 2: 헤더 버튼 영역에 삭제 버튼 추가**

기존 `✏ 정보` 버튼 옆에 삭제 버튼 추가:

```tsx
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: 'var(--tg-surface-2)', padding: '4px 8px', fontSize: 11 }}
                  onClick={() => setShowEdit(true)}>✏ 정보</button>
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: '#ff6b8a22', color: '#ff6b8a', padding: '4px 8px', fontSize: 11 }}
                  onClick={handleDelete} disabled={deleting}>🗑 삭제</button>
              </div>
```

- [ ] **Step 3: handlePersonaSelect에 extraCollectionIds 추가**

`handlePersonaSelect` 함수 내 `api.post('/api/conversations', {...})` 호출에 extraCollectionIds 추가:

```typescript
      const extraCollectionIds = [selectedUniverseId, selectedSceneId].filter(Boolean) as string[]
      const resp = await api.post('/api/conversations', {
        title: col.title,
        characterIds: [mainChar.id],
        mode: 'story',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
        ...(scenarioDescription ? { scenarioDescription } : {}),
        ...(extraCollectionIds.length > 0 ? { extraCollectionIds } : {}),
      })
```

- [ ] **Step 4: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add app/\(tingle\)/tingle/characters/\[id\]/page.tsx
git commit -m "feat(tingle/char): 삭제 버튼 + extraCollectionIds로 서사/테마 로어북 자동 복제"
```

---

## Task 6: tingle/universes/[id]/page.tsx — 삭제 버튼 + 세계관 등록 UI

**Files:**
- Modify: `apps/web/app/(tingle)/tingle/universes/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/lorebooks?collectionId=`, `POST /api/lorebooks`, `DELETE /api/lorebooks/{id}`
- Produces: 삭제 버튼, 세계관 등록/해제 UI, extraCollectionIds 전달

- [ ] **Step 1: TingleCol 인터페이스에 lorebooks 로드 상태 추가 + useEffect 수정**

파일 상단 import에 추가:
```typescript
interface Lorebook { id: string; keyword: string[]; content: string; priority: number }
```

컴포넌트 상태에 추가:
```typescript
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [worldSaving, setWorldSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
```

기존 `useEffect` 내 API 호출 수정:
```typescript
  useEffect(() => {
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
      api.get(`/api/lorebooks?collectionId=${id}`),
    ]).then(([c, all, lb]) => {
      setCol(c); setAllTingle(all); setLorebooks(lb)
    }).catch(() => {})
    setSelectedCharId(localStorage.getItem(`tg_char_uni_${id}`) ?? null)
    setSelectedSceneId(localStorage.getItem(`tg_scene_uni_${id}`) ?? null)
  }, [id])
```

- [ ] **Step 2: 삭제 핸들러 추가**

```typescript
  const handleDelete = async () => {
    if (!confirm('이 서사를 삭제할까요?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/collections/${id}`)
      router.push('/tingle')
    } catch { setDeleting(false) }
  }
```

- [ ] **Step 3: 세계관 등록/해제 핸들러 추가**

```typescript
  const handleWorldRegister = async () => {
    if (!col || worldSaving) return
    setWorldSaving(true)
    try {
      const content = col.characters[0]?.additionalInfo || col.description || ''
      if (!content.trim()) return
      const lb = await api.post('/api/lorebooks', {
        collectionId: id,
        keyword: [col.title],
        content,
        priority: 50,
      })
      setLorebooks(prev => [...prev, lb])
    } catch (e: any) {
      alert('등록 실패: ' + e.message)
    } finally { setWorldSaving(false) }
  }

  const handleWorldUnregister = async () => {
    if (!confirm('세계관 등록을 해제할까요?') || worldSaving) return
    setWorldSaving(true)
    try {
      await Promise.all(lorebooks.map(lb => api.delete(`/api/lorebooks/${lb.id}`)))
      setLorebooks([])
    } catch (e: any) {
      alert('해제 실패: ' + e.message)
    } finally { setWorldSaving(false) }
  }
```

- [ ] **Step 4: 헤더에 삭제 버튼 추가**

기존 `✏ 정보` 버튼 옆에:
```tsx
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: '#ff6b8a22', color: '#ff6b8a', padding: '4px 8px', fontSize: 11 }}
                  onClick={handleDelete} disabled={deleting}>🗑 삭제</button>
```

- [ ] **Step 5: 서사 설명 섹션 아래에 세계관 등록 UI 추가**

서사 설명 섹션(`{(col.description?.trim() || mainChar?.additionalInfo?.trim()) && (...)`)  바로 아래에 삽입:

```tsx
          {/* 세계관 등록 */}
          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#a78bfa' }}>세계관 등록</h2>
            {lorebooks.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #a78bfa', background: '#a78bfa18' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', flex: 1 }}>✓ 세계관 등록됨 — 채팅방 생성 시 자동 포함</span>
                <button
                  onClick={handleWorldUnregister}
                  disabled={worldSaving}
                  style={{ appearance: 'none', border: 'none', background: '#ff6b8a22', color: '#ff6b8a', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                  {worldSaving ? '...' : '해제'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleWorldRegister}
                disabled={worldSaving || !(col.characters[0]?.additionalInfo || col.description)}
                style={{ width: '100%', appearance: 'none', border: '1.5px dashed #a78bfa55', background: 'transparent', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#a78bfa', fontWeight: 600 }}>
                {worldSaving ? '등록 중...' : '+ 세계관으로 등록 (채팅방에 자동 포함)'}
              </button>
            )}
          </div>
```

- [ ] **Step 6: handlePersonaSelect에 extraCollectionIds 추가**

```typescript
      const extraCollectionIds = [col.id, selectedSceneId].filter(Boolean) as string[]
      const resp = await api.post('/api/conversations', {
        title: `${selectedChar!.title} × ${col.title}`,
        characterIds: [activeChar.id],
        mode: 'story',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
        ...(scenarioDescription ? { scenarioDescription } : {}),
        ...(extraCollectionIds.length > 0 ? { extraCollectionIds } : {}),
      })
```

- [ ] **Step 7: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add app/\(tingle\)/tingle/universes/\[id\]/page.tsx
git commit -m "feat(tingle/universe): 삭제 버튼 + 세계관 등록 UI + extraCollectionIds"
```

---

## Task 7: tingle/scenes/[id]/page.tsx — 삭제 버튼 + 세계관 등록 UI

**Files:**
- Modify: `apps/web/app/(tingle)/tingle/scenes/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/lorebooks?collectionId=`, `POST /api/lorebooks`, `DELETE /api/lorebooks/{id}`
- Produces: 삭제 버튼, 세계관 등록/해제 UI, extraCollectionIds 전달

(Task 6과 동일 패턴, 색상은 `#06bfd6`, 레이블은 "테마")

- [ ] **Step 1: Lorebook 인터페이스 + 상태 추가**

```typescript
interface Lorebook { id: string; keyword: string[]; content: string; priority: number }
```

컴포넌트 상태:
```typescript
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [worldSaving, setWorldSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
```

`useEffect` 수정:
```typescript
  useEffect(() => {
    Promise.all([
      api.get(`/api/collections/${id}`),
      api.get('/api/collections?isTingle=true'),
      api.get(`/api/lorebooks?collectionId=${id}`),
    ]).then(([c, all, lb]) => {
      setCol(c); setAllTingle(all); setLorebooks(lb)
    }).catch(() => {})
    setSelectedCharId(localStorage.getItem(`tg_char_scene_${id}`) ?? null)
    setSelectedUniverseId(localStorage.getItem(`tg_uni_scene_${id}`) ?? null)
  }, [id])
```

- [ ] **Step 2: 핸들러 추가**

```typescript
  const handleDelete = async () => {
    if (!confirm('이 테마를 삭제할까요?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/collections/${id}`)
      router.push('/tingle')
    } catch { setDeleting(false) }
  }

  const handleWorldRegister = async () => {
    if (!col || worldSaving) return
    setWorldSaving(true)
    try {
      const content = col.characters[0]?.additionalInfo || col.description || ''
      if (!content.trim()) return
      const lb = await api.post('/api/lorebooks', {
        collectionId: id,
        keyword: [col.title],
        content,
        priority: 50,
      })
      setLorebooks(prev => [...prev, lb])
    } catch (e: any) {
      alert('등록 실패: ' + e.message)
    } finally { setWorldSaving(false) }
  }

  const handleWorldUnregister = async () => {
    if (!confirm('세계관 등록을 해제할까요?') || worldSaving) return
    setWorldSaving(true)
    try {
      await Promise.all(lorebooks.map(lb => api.delete(`/api/lorebooks/${lb.id}`)))
      setLorebooks([])
    } catch { } finally { setWorldSaving(false) }
  }
```

- [ ] **Step 3: 헤더에 삭제 버튼 추가**

```tsx
                <button className="tingle-chip" style={{ border: 'none', cursor: 'pointer', background: '#ff6b8a22', color: '#ff6b8a', padding: '4px 8px', fontSize: 11 }}
                  onClick={handleDelete} disabled={deleting}>🗑 삭제</button>
```

- [ ] **Step 4: 테마 설명 섹션 아래에 세계관 등록 UI 추가**

```tsx
          {/* 세계관 등록 */}
          <div className="tingle-section" style={{ paddingTop: 0 }}>
            <h2 className="tingle-section-title" style={{ color: '#06bfd6' }}>세계관 등록</h2>
            {lorebooks.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #06bfd6', background: '#06bfd618' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#06bfd6', flex: 1 }}>✓ 세계관 등록됨 — 채팅방 생성 시 자동 포함</span>
                <button
                  onClick={handleWorldUnregister}
                  disabled={worldSaving}
                  style={{ appearance: 'none', border: 'none', background: '#ff6b8a22', color: '#ff6b8a', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                  {worldSaving ? '...' : '해제'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleWorldRegister}
                disabled={worldSaving || !(col.characters[0]?.additionalInfo || col.description)}
                style={{ width: '100%', appearance: 'none', border: '1.5px dashed #06bfd655', background: 'transparent', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#06bfd6', fontWeight: 600 }}>
                {worldSaving ? '등록 중...' : '+ 세계관으로 등록 (채팅방에 자동 포함)'}
              </button>
            )}
          </div>
```

- [ ] **Step 5: handlePersonaSelect에 extraCollectionIds 추가**

```typescript
      const extraCollectionIds = [col.id, selectedUniverseId].filter(Boolean) as string[]
      const resp = await api.post('/api/conversations', {
        title: `${selectedChar!.title} × ${col.title}`,
        characterIds: [activeChar.id],
        mode: 'story',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
        ...(scenarioDescription ? { scenarioDescription } : {}),
        ...(extraCollectionIds.length > 0 ? { extraCollectionIds } : {}),
      })
```

- [ ] **Step 6: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add app/\(tingle\)/tingle/scenes/\[id\]/page.tsx
git commit -m "feat(tingle/scene): 삭제 버튼 + 세계관 등록 UI + extraCollectionIds"
```

---

## Task 8: 서브모듈 커밋 + 배포

- [ ] **Step 1: apps/web 최종 푸시**

```bash
cd /home/server/StoryFit/apps/web
git push origin main
```

- [ ] **Step 2: parent repo 서브모듈 포인터 업데이트**

```bash
cd /home/server/StoryFit
git add apps/web
git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (팅글 센터 개편 — 탭/직접가져오기/세계관등록/extraCollectionIds)"
git push origin master
```

- [ ] **Step 3: 서버 배포**

```bash
git pull origin master && git submodule update --remote apps/web && docker compose up --build -d
```

---

## Self-Review

**스펙 커버리지 점검:**

| 요구사항 | 구현 태스크 |
|---------|------------|
| 캐릭터/서사/테마 주탭 | Task 4 Step 8 |
| 진행중/대기/완결/즐겨찾기 상태 필터 | Task 4 Step 8 |
| 미리보기 모달 제거 → 직접 가져오기 | Task 4 Steps 2,5,7 |
| 좋아요 목록 직접 가져오기 | Task 4 Step 6 |
| 캐릭터 가져오기 시 서사/테마 localStorage 자동매핑 | Task 4 Step 4 |
| JSON 전체 필드 수집 (catch-all) | Task 1 Steps 2,3,4 |
| 서사 worldBooks → lorebooks | Task 1 Step 3, Task 2 |
| 캐릭터 firstMessage 폴백 | Task 1 Step 2 |
| 삭제 버튼 (캐릭터/서사/테마 디테일) | Task 5 Step 1-2, Task 6 Step 2, Task 7 Step 2 |
| 수정 버튼 — 이미 있음 (CollectionEditModal) | 변경 불필요 |
| 세계관 등록 UI (서사/테마 디테일) | Task 6 Steps 3-5, Task 7 Steps 3-4 |
| 선택된 서사/테마 로어북 채팅방 자동 복제 | Task 3, Task 5 Step 3, Task 6 Step 6, Task 7 Step 5 |

**누락 없음 확인됨.**
