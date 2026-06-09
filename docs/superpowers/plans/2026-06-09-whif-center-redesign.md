# WHIF 센터 재설계 (1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** import한 WHIF 작품/캐릭터를 whif.io와 동일한 다크 몰입형 UI(탐색·작품상세·캐릭터상세)로 보여주고, 그에 필요한 데이터(작품 커버/설명/태그)를 모델·import에 보강한다.

**Architecture:** `CharacterCollection`에 표시용 컬럼 3개를 추가하고 import 매핑을 보강한다. 화면은 기존 라이트 테마/Win 셸과 분리된 신규 라우트 그룹 `(whif)`에 `.whif-root` 스코프 다크 토큰으로 구현한다. 기존 `(main)/whif`의 CRUD 로직을 이식하되, 소비 UI는 깨끗이 두고 관리 기능은 편집 모드/⋮ 메뉴로 격리한다.

**Tech Stack:** Next.js 14 App Router, React, Prisma(PostgreSQL, `db push`), vitest, CSS(globals.css).

**Source of truth for ported CRUD logic:** 기존 `apps/web/app/(main)/whif/page.tsx` — import/컬렉션·캐릭터·로어북 CRUD, 다중선택 삭제, 도입부 선택, 페르소나 모달 로직이 전부 들어 있다. 이 계획에서 "기존 로직 이식"이라 함은 이 파일의 핸들러를 그대로 옮겨오는 것을 뜻한다.

**Spec:** `docs/superpowers/specs/2026-06-09-whif-center-redesign-design.md`

---

## File Structure

**Create**
- `app/(whif)/layout.tsx` — 다크 몰입형 셸(인증 가드, `.whif-root` 래퍼, 하단 안전영역). Win/Dock 없음.
- `app/(whif)/whif/page.tsx` — 탐색(홈): 캐릭터/작품 탭 + ⋮ 관리 메뉴 + 편집 모드 + import.
- `app/(whif)/whif/universes/[id]/page.tsx` — 작품 상세.
- `app/(whif)/whif/characters/[id]/page.tsx` — 캐릭터 상세(시작 상황 칩 포함).
- `scripts/backfill-whif-collections.mjs` — 기존 컬렉션 백필 1회 스크립트.

**Modify**
- `prisma/schema.prisma` — `CharacterCollection`에 컬럼 3개.
- `lib/import/types.ts` — `AssembledResult.coverImageUrl?` 추가.
- `lib/import/capture.ts` — `captureWhif`의 assembledResult에 `coverImageUrl`.
- `app/api/characters/import/route.ts` — 컬렉션 생성 시 새 컬럼 매핑.
- `app/api/collections/route.ts` — GET select 확장.
- `app/globals.css` — `.whif-*` 다크 네임스페이스 스타일 추가(하단).
- `components/shell/Dock.tsx` — (확인용) WHIF 링크 경로 유지 점검. 변경 없을 가능성 높음.

**Delete (마지막 단계)**
- `app/(main)/whif/page.tsx` — 신규 그룹으로 대체 후 제거.

---

## Task 1: CharacterCollection 컬럼 추가

**Files:**
- Modify: `prisma/schema.prisma` (model `CharacterCollection`, 현재 85-95행)

- [ ] **Step 1: 스키마에 컬럼 추가**

`model CharacterCollection { ... }` 안, `characters Character[]` 아래에 추가:

```prisma
model CharacterCollection {
  id             String        @id @default(cuid())
  title          String
  sourceUrl      String        @default("")
  userId         String
  conversationId String?       @unique
  user           User          @relation(fields: [userId], references: [id])
  conversation   Conversation? @relation(fields: [conversationId], references: [id])
  characters     Character[]
  coverImageUrl  String        @default("")
  description    String        @default("")
  tags           String[]      @default([])
  createdAt      DateTime      @default(now())
}
```

- [ ] **Step 2: DB에 반영 + 클라이언트 재생성**

Run:
```bash
npm run db:push && npm run db:generate
```
Expected: `Your database is now in sync with your Prisma schema.` 및 `Generated Prisma Client` 출력. 오류 없음.

- [ ] **Step 3: 타입 반영 확인**

Run: `npx tsc --noEmit`
Expected: 새 컬럼 관련 오류 없음(기존 코드는 새 컬럼을 아직 안 쓰므로 통과).

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma
git commit -m "Feat: CharacterCollection에 coverImageUrl/description/tags 컬럼 추가"
```

---

## Task 2: AssembledResult 타입에 coverImageUrl 추가

**Files:**
- Modify: `lib/import/types.ts` (`AssembledResult` interface)

- [ ] **Step 1: 타입에 옵셔널 필드 추가**

`AssembledResult` 인터페이스를 수정:

```ts
export interface AssembledResult {
  characters: AssembledCharacter[]
  scenarioDescription: string
  tags: string[]
  title: string
  safetyLevel?: string
  coverImageUrl?: string
}
```

- [ ] **Step 2: 기존 import 테스트가 깨지지 않는지 확인**

Run: `npm test`
Expected: `lib/import/*.test.ts` 전부 PASS (옵셔널 필드라 영향 없음).

- [ ] **Step 3: 커밋**

```bash
git add lib/import/types.ts
git commit -m "Feat: AssembledResult에 coverImageUrl 옵셔널 필드 추가"
```

---

## Task 3: captureWhif가 작품 커버 이미지를 전달

**Files:**
- Modify: `lib/import/capture.ts` (`captureWhif`, 현재 584-590행의 `assembledResult` 리터럴)

- [ ] **Step 1: assembledResult에 coverImageUrl 추가**

`captureWhif` 안 `const assembledResult = { ... }`를 수정:

```ts
    const assembledResult = {
      characters,
      scenarioDescription: universe.description || '',
      tags: universe.tags || [],
      title: universe.name || mainChar.name || '캐릭터',
      safetyLevel,
      coverImageUrl: universe.imageUrl || mainChar.avatarUrl || '',
    }
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/import/capture.ts
git commit -m "Feat: WHIF 캡처 시 작품 커버 이미지(universe.imageUrl) 전달"
```

---

## Task 4: import route — 컬렉션에 새 컬럼 매핑

**Files:**
- Modify: `app/api/characters/import/route.ts` (`runImport` 내 `prisma.characterCollection.create`, 현재 118-120행)

- [ ] **Step 1: 컬렉션 생성에 새 컬럼 매핑**

```ts
  const collectionTitle = (captured.title || result.title || firstName).trim()
  const collection = await prisma.characterCollection.create({
    data: {
      title: collectionTitle,
      sourceUrl: url,
      userId,
      conversationId: conversation.id,
      coverImageUrl: result.coverImageUrl ?? '',
      description: result.scenarioDescription ?? '',
      tags: result.tags ?? [],
    },
  })
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 런타임 확인 (수동)**

개발 서버(`npm run dev`)에서 WHIF 캐릭터 URL 1건을 ⋮ 가져오기 또는 기존 `/whif` import로 넣고, DB에서 확인:
```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.characterCollection.findFirst({where:{sourceUrl:{contains:'whif.'}},orderBy:{createdAt:'desc'}}).then(c=>{console.log({cover:c.coverImageUrl,desc:c.description?.slice(0,40),tags:c.tags});process.exit(0)})"
```
Expected: `cover`/`desc`/`tags`가 채워져 출력.

- [ ] **Step 4: 커밋**

```bash
git add app/api/characters/import/route.ts
git commit -m "Feat: import 시 작품 커버/설명/태그를 컬렉션에 저장"
```

---

## Task 5: collections API GET select 확장

**Files:**
- Modify: `app/api/collections/route.ts` (GET의 `select`, 현재 28행)

- [ ] **Step 1: select에 새 컬럼 + 소속 캐릭터 요약 추가**

```ts
  const collections = await prisma.characterCollection.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, sourceUrl: true, createdAt: true,
      coverImageUrl: true, description: true, tags: true,
      characters: { select: { id: true, name: true, avatarUrl: true } },
    },
  })
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 런타임 확인 (수동)**

로그인 상태에서 브라우저 콘솔 또는 curl로 `/api/collections?isWhif=true` 응답에 `coverImageUrl`,`description`,`tags`,`characters[]`가 있는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/api/collections/route.ts
git commit -m "Feat: collections GET에 커버/설명/태그/소속캐릭터 반환"
```

---

## Task 6: 기존 컬렉션 백필 스크립트

**Files:**
- Create: `scripts/backfill-whif-collections.mjs`

- [ ] **Step 1: 백필 스크립트 작성**

```js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const collections = await prisma.characterCollection.findMany({
    where: { sourceUrl: { contains: 'whif.' } },
    include: {
      conversation: { select: { scenarioDescription: true, tags: true } },
      characters: { select: { avatarUrl: true }, take: 1 },
    },
  })

  let updated = 0
  for (const c of collections) {
    const data = {}
    if (!c.description && c.conversation?.scenarioDescription) data.description = c.conversation.scenarioDescription
    if ((!c.tags || c.tags.length === 0) && c.conversation?.tags?.length) data.tags = c.conversation.tags
    if (!c.coverImageUrl && c.characters[0]?.avatarUrl) data.coverImageUrl = c.characters[0].avatarUrl
    if (Object.keys(data).length === 0) continue
    await prisma.characterCollection.update({ where: { id: c.id }, data })
    updated++
  }
  console.log(`backfilled ${updated}/${collections.length} collections`)
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 2: 실행**

Run: `node scripts/backfill-whif-collections.mjs`
Expected: `backfilled N/M collections` 출력, 오류 없음.

- [ ] **Step 3: 커밋**

```bash
git add scripts/backfill-whif-collections.mjs
git commit -m "Chore: 기존 WHIF 컬렉션 커버/설명/태그 백필 스크립트"
```

---

## Task 7: (whif) 라우트 그룹 레이아웃 + 다크 테마 토큰

**Files:**
- Create: `app/(whif)/layout.tsx`
- Modify: `app/globals.css` (파일 맨 끝에 append)

- [ ] **Step 1: 다크 테마 토큰 + whif 스타일을 globals.css 끝에 추가**

```css

/* ─── WHIF immersive (dark, scoped) ─────────────────────────────── */
.whif-root{
  --w-bg:#0d0d0d; --w-surface:#17171c; --w-surface-2:#202028; --w-line:#2a2a33;
  --w-ink:#f2f2f5; --w-ink-soft:#a0a0ad; --w-accent:#8b5cf6; --w-accent-2:#7c3aed;
  --w-radius:12px;
  position:fixed; inset:0; z-index:50;
  background:var(--w-bg); color:var(--w-ink);
  display:flex; flex-direction:column; overflow:hidden;
  font-family:var(--font-body);
}
.whif-scroll{ flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch;
  padding-bottom:calc(16px + env(safe-area-inset-bottom)); }
.whif-header{ flex-shrink:0; display:flex; align-items:center; justify-content:space-between;
  padding:14px 16px; border-bottom:1px solid var(--w-line); background:var(--w-bg); }
.whif-logo{ font-size:18px; font-weight:800; letter-spacing:.02em; color:var(--w-ink); }
.whif-iconbtn{ background:none; border:none; color:var(--w-ink); font-size:20px; cursor:pointer; padding:4px 8px; }
.whif-tabs{ display:flex; gap:18px; padding:0 16px; border-bottom:1px solid var(--w-line); flex-shrink:0; }
.whif-tab{ background:none; border:none; color:var(--w-ink-soft); font-size:15px; font-weight:700;
  padding:12px 2px; cursor:pointer; border-bottom:2px solid transparent; }
.whif-tab.active{ color:var(--w-ink); border-bottom-color:var(--w-accent); }
.whif-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:12px; padding:16px; }
.whif-card{ background:var(--w-surface); border:1px solid var(--w-line); border-radius:var(--w-radius);
  overflow:hidden; cursor:pointer; display:flex; flex-direction:column; }
.whif-card-img{ width:100%; aspect-ratio:3/4; object-fit:cover; background:var(--w-surface-2); display:block; }
.whif-card-body{ padding:10px; display:flex; flex-direction:column; gap:4px; }
.whif-card-title{ font-size:13px; font-weight:700; color:var(--w-ink); overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.whif-card-sub{ font-size:11px; color:var(--w-ink-soft); }
.whif-card-desc{ font-size:11px; color:var(--w-ink-soft); line-height:1.45;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.whif-chip{ display:inline-block; background:var(--w-surface-2); color:var(--w-ink-soft);
  font-size:11px; padding:2px 9px; border-radius:999px; }
.whif-chip.sel{ background:var(--w-accent); color:#fff; }
.whif-empty{ padding:48px 16px; text-align:center; color:var(--w-ink-soft); font-size:13px; }
.whif-cover{ width:100%; aspect-ratio:1; object-fit:cover; background:var(--w-surface-2); display:block; }
.whif-section{ padding:16px; }
.whif-section-title{ font-size:14px; font-weight:800; color:var(--w-ink); margin:0 0 10px; }
.whif-cta{ position:sticky; bottom:0; padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  background:linear-gradient(180deg, transparent, var(--w-bg) 40%); }
.whif-cta-btn{ width:100%; padding:14px; border:none; border-radius:999px; background:var(--w-accent);
  color:#fff; font-size:15px; font-weight:800; cursor:pointer; }
.whif-menu{ position:absolute; top:52px; right:12px; z-index:60; background:var(--w-surface-2);
  border:1px solid var(--w-line); border-radius:10px; overflow:hidden; min-width:180px; }
.whif-menu-item{ display:block; width:100%; text-align:left; background:none; border:none;
  color:var(--w-ink); font-size:13px; padding:11px 14px; cursor:pointer; }
.whif-menu-item:hover{ background:var(--w-surface); }
.whif-back{ background:none; border:none; color:var(--w-ink); font-size:20px; cursor:pointer; padding:4px 8px; }
```

- [ ] **Step 2: (whif) 레이아웃 작성**

`app/(whif)/layout.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppProvider } from '@/providers/AppProvider'
import { getAccessToken } from '@/lib/authClient'

export default function WhifLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => { if (!getAccessToken()) router.replace('/login') }, [])
  return (
    <AppProvider>
      <div className="whif-root">{children}</div>
    </AppProvider>
  )
}
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 오류 없음. (라우트 그룹 `(whif)`와 `(main)`이 같은 URL 세그먼트 `whif`를 갖지만, 기존 `(main)/whif`는 Task 12에서 제거. 그 전까지 Next.js가 라우트 충돌을 경고할 수 있으므로, **이 시점에 먼저 기존 `app/(main)/whif/page.tsx`를 임시로 비활성**: 파일명을 `page.tsx.bak`으로 바꿔 충돌 회피.)

```bash
mv "app/(main)/whif/page.tsx" "app/(main)/whif/page.tsx.bak"
```

- [ ] **Step 4: 커밋**

```bash
git add "app/globals.css" "app/(whif)/layout.tsx" "app/(main)/whif/page.tsx.bak"
git rm --cached "app/(main)/whif/page.tsx" 2>/dev/null || true
git commit -m "Feat: WHIF 몰입형 라우트 그룹 레이아웃 + 다크 테마 토큰"
```

---

## Task 8: 탐색(홈) 페이지

**Files:**
- Create: `app/(whif)/whif/page.tsx`

데이터 로딩·import·편집모드·삭제 로직은 기존 `app/(main)/whif/page.tsx.bak`의 핸들러를 이식한다(아래 코드에 핵심만 포함, 나머지 CRUD는 Task 10에서 상세 페이지와 함께 마무리).

- [ ] **Step 1: 탐색 페이지 작성**

`app/(whif)/whif/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Character { id: string; name: string; avatarUrl: string | null; additionalInfo: string; tags: string[]; collection?: { id: string } | null }
interface Universe { id: string; title: string; coverImageUrl: string; tags: string[]; characters: { id: string; name: string; avatarUrl: string | null }[] }

export default function WhifExplorePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'characters' | 'universes'>('universes')
  const [universes, setUniverses] = useState<Universe[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchData() }, [])
  const fetchData = async () => {
    setLoading(true)
    try {
      const [u, c] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
      ])
      setUniverses(u); setCharacters(c)
    } finally { setLoading(false) }
  }

  const handleImport = async () => {
    if (!importUrl.trim() || importing) return
    setImporting(true); setMsg('')
    try {
      await api.post('/api/characters/import', { url: importUrl.trim() })
      setImportUrl(''); setMsg('가져왔습니다'); setMenuOpen(false)
      await fetchData()
    } catch (e: any) { setMsg(e.message ?? '가져오기 실패') }
    finally { setImporting(false) }
  }

  return (
    <>
      <div className="whif-header">
        <div className="whif-logo">WHIF</div>
        <button className="whif-iconbtn" onClick={() => setMenuOpen(o => !o)}>⋮</button>
      </div>

      {menuOpen && (
        <div className="whif-menu">
          <div style={{ padding: 10, display: 'flex', gap: 6 }}>
            <input className="field" style={{ flex: 1 }} placeholder="https://whif.io/..." value={importUrl}
              onChange={e => setImportUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleImport() }} />
            <button className="whif-menu-item" style={{ width: 'auto', background: 'var(--w-accent)', borderRadius: 8 }}
              disabled={importing} onClick={handleImport}>{importing ? '...' : '가져오기'}</button>
          </div>
        </div>
      )}
      {msg && <div className="whif-empty" style={{ padding: '8px 16px', color: 'var(--w-accent)' }}>{msg}</div>}

      <div className="whif-tabs">
        <button className={`whif-tab ${tab === 'universes' ? 'active' : ''}`} onClick={() => setTab('universes')}>작품</button>
        <button className={`whif-tab ${tab === 'characters' ? 'active' : ''}`} onClick={() => setTab('characters')}>캐릭터</button>
      </div>

      <div className="whif-scroll">
        {loading ? (
          <div className="whif-empty">불러오는 중...</div>
        ) : tab === 'universes' ? (
          universes.length === 0 ? (
            <div className="whif-empty">가져온 작품이 없습니다 — ⋮ 메뉴에서 WHIF URL로 가져오세요.</div>
          ) : (
            <div className="whif-grid">
              {universes.map(u => {
                const thumb = u.coverImageUrl || u.characters[0]?.avatarUrl || ''
                return (
                  <div key={u.id} className="whif-card" onClick={() => router.push(`/whif/universes/${u.id}`)}>
                    {thumb ? <img className="whif-card-img" src={thumb} alt="" />
                      : <div className="whif-card-img" />}
                    <div className="whif-card-body">
                      <div className="whif-card-title">{u.title}</div>
                      <div className="whif-card-sub">{u.characters.length}명 소속</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          characters.length === 0 ? (
            <div className="whif-empty">가져온 캐릭터가 없습니다.</div>
          ) : (
            <div className="whif-grid">
              {characters.map(c => (
                <div key={c.id} className="whif-card" onClick={() => router.push(`/whif/characters/${c.id}`)}>
                  {c.avatarUrl ? <img className="whif-card-img" src={c.avatarUrl} alt="" />
                    : <div className="whif-card-img" />}
                  <div className="whif-card-body">
                    <div className="whif-card-title">{c.name}</div>
                    {c.additionalInfo?.trim() && <div className="whif-card-desc">{c.additionalInfo}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: 빌드/타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 런타임 확인 (수동)**

`npm run dev` → `/whif` 접속. 다크 몰입형 화면, 작품/캐릭터 탭 전환, 카드 그리드 표시, ⋮ 메뉴 import 동작 확인.

- [ ] **Step 4: 커밋**

```bash
git add "app/(whif)/whif/page.tsx"
git commit -m "Feat: WHIF 탐색(홈) 화면 — 작품/캐릭터 탭 + import 메뉴"
```

---

## Task 9: 작품(세계관) 상세 페이지

**Files:**
- Create: `app/(whif)/whif/universes/[id]/page.tsx`

- [ ] **Step 1: 작품 상세 페이지 작성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Universe { id: string; title: string; coverImageUrl: string; description: string; tags: string[]; characters: { id: string; name: string; avatarUrl: string | null }[] }
interface Character { id: string; name: string; avatarUrl: string | null; tags: string[]; collection?: { id: string } | null }
interface Lorebook { id: string; keyword: string[]; content: string; priority: number }

export default function UniverseDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [uni, setUni] = useState<Universe | null>(null)
  const [chars, setChars] = useState<Character[]>([])
  const [lore, setLore] = useState<Lorebook[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    (async () => {
      const [unis, allChars, lb] = await Promise.all([
        api.get('/api/collections?isWhif=true'),
        api.get('/api/characters?isWhif=true'),
        api.get(`/api/lorebooks?collectionId=${id}`),
      ])
      setUni(unis.find((u: Universe) => u.id === id) ?? null)
      setChars(allChars.filter((c: Character) => c.collection?.id === id))
      setLore(lb)
    })()
  }, [id])

  if (!uni) return <div className="whif-empty">불러오는 중...</div>
  const cover = uni.coverImageUrl || uni.characters[0]?.avatarUrl || ''

  return (
    <div className="whif-scroll">
      <div style={{ position: 'relative' }}>
        {cover ? <img className="whif-cover" src={cover} alt="" /> : <div className="whif-cover" />}
        <button className="whif-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
      </div>

      <div className="whif-section">
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>{uni.title}</h1>
        {uni.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {uni.tags.map(t => <span key={t} className="whif-chip">#{t}</span>)}
          </div>
        )}
        {uni.description && (
          <div>
            <p style={{ color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0,
              ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
              {uni.description}
            </p>
            <button className="whif-iconbtn" style={{ fontSize: 13, color: 'var(--w-accent)', padding: '6px 0' }}
              onClick={() => setExpanded(e => !e)}>{expanded ? '접기' : '더보기'}</button>
          </div>
        )}
      </div>

      <div className="whif-section">
        <h2 className="whif-section-title">캐릭터 ({chars.length})</h2>
        <div className="whif-grid" style={{ padding: 0 }}>
          {chars.map(c => (
            <div key={c.id} className="whif-card" onClick={() => router.push(`/whif/characters/${c.id}`)}>
              {c.avatarUrl ? <img className="whif-card-img" src={c.avatarUrl} alt="" /> : <div className="whif-card-img" />}
              <div className="whif-card-body"><div className="whif-card-title">{c.name}</div></div>
            </div>
          ))}
        </div>
      </div>

      {lore.length > 0 && (
        <div className="whif-section">
          <h2 className="whif-section-title">백과사전 ({lore.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lore.map(lb => (
              <div key={lb.id} style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {lb.keyword.map(k => <span key={k} className="whif-chip sel" style={{ fontSize: 10 }}>{k}</span>)}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--w-ink-soft)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{lb.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 빌드/타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 런타임 확인 (수동)**

`/whif`에서 작품 카드 탭 → 커버/제목/태그/더보기/캐릭터 그리드/백과사전 표시, 뒤로가기 동작 확인.

- [ ] **Step 4: 커밋**

```bash
git add "app/(whif)/whif/universes/[id]/page.tsx"
git commit -m "Feat: WHIF 작품 상세 화면 (커버/설명/태그/캐릭터/백과사전)"
```

---

## Task 10: 캐릭터 상세 페이지 (시작 상황 칩 + 채팅 하기)

**Files:**
- Create: `app/(whif)/whif/characters/[id]/page.tsx`

채팅 진입은 1단계에서 **기존 흐름**을 재사용: 기존 `PersonaSelectModal`(`@/components/ui/PersonaSelectModal`)과 `POST /api/conversations`를 그대로 쓴다. 로직은 기존 `page.tsx.bak`의 `startChatFlow`/`handlePersonaSelect`를 이식한다.

- [ ] **Step 1: 캐릭터 상세 페이지 작성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import PersonaSelectModal from '@/components/ui/PersonaSelectModal'

interface Opening { id: string; title: string; content: string }
interface Character {
  id: string; name: string; gender: string; avatarUrl: string | null; tags: string[]
  additionalInfo: string; safetyLevel: string
  openingMessages?: Opening[]; collection?: { id: string } | null
}

export default function CharacterDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [char, setChar] = useState<Character | null>(null)
  const [allChars, setAllChars] = useState<Character[]>([])
  const [openingIdx, setOpeningIdx] = useState(0)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    (async () => {
      const list: Character[] = await api.get('/api/characters?isWhif=true')
      setAllChars(list)
      setChar(list.find(c => c.id === id) ?? null)
    })()
  }, [id])

  if (!char) return <div className="whif-empty">불러오는 중...</div>

  const openings = char.openingMessages ?? []
  const nsfw = char.safetyLevel === 'relaxed'
  const personaCandidates = allChars.filter(c => c.collection?.id === char.collection?.id && c.id !== char.id)

  const handlePersonaSelect = async (personaCharId: string | null, newName?: string) => {
    setCreating(true)
    try {
      let personaId = personaCharId
      if (!personaId && newName?.trim()) {
        const p = await api.post('/api/characters', { name: newName.trim() })
        personaId = p.id
      }
      const chosen = openings[openingIdx]?.content
      const resp = await api.post('/api/conversations', {
        title: char.name,
        characterIds: [char.id],
        mode: 'roleplay',
        personaCharacterId: personaId,
        ...(chosen !== undefined ? { openingMessage: chosen } : {}),
      })
      router.push(`/conversations/${resp.id}`)
    } catch (e: any) {
      alert('채팅방 생성 실패: ' + e.message); setCreating(false)
    }
  }

  return (
    <>
      {personaOpen && (
        <PersonaSelectModal
          candidates={personaCandidates as any}
          loading={creating}
          onCancel={() => { setPersonaOpen(false); setCreating(false) }}
          onSelect={(charId, newName) => handlePersonaSelect(charId, newName)}
        />
      )}

      <div className="whif-scroll">
        <div style={{ position: 'relative' }}>
          {char.avatarUrl ? <img className="whif-cover" src={char.avatarUrl} alt="" /> : <div className="whif-cover" />}
          <button className="whif-back" style={{ position: 'absolute', top: 12, left: 8 }} onClick={() => router.back()}>‹</button>
        </div>

        <div className="whif-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{char.name}</h1>
            {nsfw && <span className="whif-chip" style={{ background: '#7f1d1d', color: '#fecaca' }}>19금</span>}
          </div>
          {char.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {char.tags.map(t => <span key={t} className="whif-chip">#{t}</span>)}
            </div>
          )}
        </div>

        <div className="whif-section">
          <h2 className="whif-section-title">캐릭터 소개</h2>
          <p style={{ color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{char.additionalInfo}</p>
        </div>

        {openings.length > 0 && (
          <div className="whif-section">
            <h2 className="whif-section-title">시작 상황</h2>
            {openings.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {openings.map((op, i) => (
                  <button key={op.id} className={`whif-chip ${i === openingIdx ? 'sel' : ''}`}
                    style={{ border: 'none', cursor: 'pointer' }} onClick={() => setOpeningIdx(i)}>{op.title}</button>
                ))}
              </div>
            )}
            <p style={{ background: 'var(--w-surface)', border: '1px solid var(--w-line)', borderRadius: 10,
              padding: 14, color: 'var(--w-ink-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
              {openings[openingIdx]?.content}
            </p>
          </div>
        )}
      </div>

      <div className="whif-cta">
        <button className="whif-cta-btn" onClick={() => setPersonaOpen(true)}>채팅 하기</button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 빌드/타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음. (`PersonaSelectModal`의 `candidates` prop 타입이 다르면 `as any`로 맞춤 — 기존 page.tsx.bak도 동일 모달을 사용하므로 호환.)

- [ ] **Step 3: 런타임 확인 (수동)**

캐릭터 카드 탭 → 아바타/이름/배지/태그/소개/시작상황 칩 전환/미리보기 표시, "채팅 하기" → 페르소나 모달 → 대화방 생성 후 `/conversations/[id]` 이동 확인.

- [ ] **Step 4: 커밋**

```bash
git add "app/(whif)/whif/characters/[id]/page.tsx"
git commit -m "Feat: WHIF 캐릭터 상세 화면 (시작 상황 칩 + 채팅 진입)"
```

---

## Task 11: 편집 모드 — 관리 기능 격리 (삭제/로어북/캐릭터 등록)

소비 UI를 깨끗이 유지하면서, 기존 `page.tsx.bak`의 관리 기능(컬렉션 삭제, 캐릭터 삭제·다중선택, 로어북 CRUD, 직접 등록)을 편집 모드에 이식한다.

**Files:**
- Modify: `app/(whif)/whif/universes/[id]/page.tsx`
- Modify: `app/(whif)/whif/page.tsx`

- [ ] **Step 1: 탐색 ⋮ 메뉴에 "편집 모드" 토글 + "새 작품" 추가**

`app/(whif)/whif/page.tsx`의 ⋮ 메뉴(`whif-menu`)에 항목 추가. 상태 `const [editMode, setEditMode] = useState(false)`를 추가하고 `localStorage('whif_edit')`에 저장(상세 페이지와 공유). 메뉴 내부에 버튼 추가:

```tsx
          <button className="whif-menu-item" onClick={() => {
            const next = !editMode; setEditMode(next); localStorage.setItem('whif_edit', next ? '1' : '0'); setMenuOpen(false)
          }}>{editMode ? '편집 모드 끄기' : '편집 모드 켜기'}</button>
          <button className="whif-menu-item" onClick={async () => {
            const title = prompt('새 작품 이름'); if (!title?.trim()) return
            await api.post('/api/collections', { title: title.trim(), sourceUrl: `https://whif.io/local/${Date.now()}` })
            setMenuOpen(false); await fetchData()
          }}>새 작품 만들기</button>
```

`useEffect` 초기화에 `setEditMode(localStorage.getItem('whif_edit') === '1')` 추가. 편집 모드일 때 작품/캐릭터 카드에 삭제 버튼(`✕`)을 absolute로 노출:

```tsx
{editMode && (
  <button className="whif-iconbtn" style={{ position: 'absolute', top: 4, right: 4, color: '#ff6b8a' }}
    onClick={e => { e.stopPropagation(); deleteUniverse(u.id) }}>✕</button>
)}
```

`deleteUniverse`/`deleteCharacter`는 기존 `page.tsx.bak`의 `handleDeleteUniverse`/`handleDeleteCharacter`를 이식(확인은 `confirm()` 사용):

```tsx
const deleteUniverse = async (cid: string) => {
  if (!confirm('이 작품과 소속 캐릭터를 삭제할까요?')) return
  await api.delete(`/api/collections/${cid}`); await fetchData()
}
const deleteCharacter = async (chid: string) => {
  if (!confirm('이 캐릭터를 삭제할까요?')) return
  await api.delete(`/api/characters/${chid}`); await fetchData()
}
```

(카드 컨테이너에 `style={{ position: 'relative' }}` 보장 — `whif-card`에 이미 적용되어 있지 않으면 추가.)

- [ ] **Step 2: 작품 상세에 편집 모드 — 직접 등록 + 로어북 CRUD**

`app/(whif)/whif/universes/[id]/page.tsx`에 `const editMode = typeof window !== 'undefined' && localStorage.getItem('whif_edit') === '1'`를 추가(클라이언트 컴포넌트라 `useState`+`useEffect`로 읽기). 편집 모드일 때:
- 캐릭터 섹션 헤더에 `+ 직접 등록` 버튼 → `router.push(\`/characters/new?isWhif=true&collectionId=\${id}\`)`
- 백과사전 섹션에 `+ 설정 카드` 추가 폼 + 각 카드에 수정/삭제 — 기존 `page.tsx.bak`의 `handleSaveLore`/`handleDeleteLore` 이식(`scope:'collection', scopeId:id`).

상태/핸들러는 `page.tsx.bak`의 로어북 폼 상태(`showAddLore`,`loreKeyword`,`loreContent`,`lorePriority`,`editingLoreId`)와 핸들러를 그대로 옮긴다. 폼 스타일은 `whif-*` 클래스로 대체.

- [ ] **Step 3: 빌드/타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 런타임 확인 (수동)**

⋮ → 편집 모드 켜기 → 카드 삭제 버튼 노출/삭제, 새 작품 생성, 작품 상세에서 직접 등록·로어북 추가/수정/삭제 동작. 편집 모드 끄면 전부 숨김.

- [ ] **Step 5: 커밋**

```bash
git add "app/(whif)/whif/page.tsx" "app/(whif)/whif/universes/[id]/page.tsx"
git commit -m "Feat: WHIF 편집 모드 — 삭제/직접등록/로어북 CRUD 격리"
```

---

## Task 12: 기존 (main)/whif 제거 + Dock 링크 점검

**Files:**
- Delete: `app/(main)/whif/page.tsx.bak`
- Verify: `components/shell/Dock.tsx`

- [ ] **Step 1: 백업 파일 제거**

```bash
rm "app/(main)/whif/page.tsx.bak"
```
(`app/(main)/whif/` 디렉터리가 비면 디렉터리도 제거: `rmdir "app/(main)/whif"`)

- [ ] **Step 2: Dock 링크 확인**

`components/shell/Dock.tsx`의 WHIF 탭은 `router.push('/whif')`로 신규 그룹 페이지로 이동한다(경로 동일). 변경 불필요. 확인만.

- [ ] **Step 3: 빌드 + 라우트 충돌 없는지 확인**

Run: `npm run build`
Expected: 빌드 성공. `/whif` 라우트가 `(whif)` 그룹으로만 해석되고 충돌 경고 없음.

- [ ] **Step 4: 전체 회귀 확인 (수동)**

- `/` (메인 라이트 테마) 정상 — 다크 토큰 오염 없음.
- Dock "🪐 WHIF" → 다크 몰입형 `/whif` 진입.
- import → 탐색 → 작품상세 → 캐릭터상세 → 채팅 하기 전체 흐름.

- [ ] **Step 5: 커밋**

```bash
git add -A "app/(main)/whif"
git commit -m "Refactor: 기존 (main)/whif 페이지 제거 (몰입형 (whif) 그룹으로 대체)"
```

---

## Task 13: 배포 푸시 (사용자 확인 후)

CLAUDE.md 배포 규칙: apps/web는 서브모듈이라 2단계 푸시. **사용자가 푸시를 명시적으로 요청할 때만 수행.**

- [ ] **Step 1: 서브모듈 push (main)**

```bash
cd apps/web && git push origin main
```

- [ ] **Step 2: 부모 레포 포인터 업데이트 (master)**

```bash
cd ../.. && git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (WHIF 센터 몰입형 재설계 1단계)" && git push origin master
```

---

## Self-Review 결과

- **Spec 커버리지**: §3 데이터모델→T1,T2 / §4 import매핑→T3,T4 / §3.2 백필→T6 / §5 API→T5 / §6 아키텍처·테마→T7 / §7.1 탐색→T8 / §7.2 작품상세→T9 / §7.3 캐릭터상세→T10 / §8 관리기능→T11 / 기존제거→T12 / 배포→T13. 누락 없음.
- **소셜 지표/제작자핸들/요약분리 제외**: 어떤 태스크에도 컬럼/필드 없음 — 비목표 준수.
- **타입 일관성**: `coverImageUrl`(T2 타입 → T3 생성 → T4 저장 → T5 반환 → T8/T9 사용), `description`/`tags`(T1→T4→T5→T9), `openingMessages.{id,title,content}`(기존 타입 재사용, T10). 명칭 일치 확인.
- **라우트 충돌 주의**: `(main)/whif`와 `(whif)/whif`가 같은 URL을 가지므로 T7 Step3에서 기존 파일을 `.bak`으로 비활성화한 뒤 진행, T12에서 완전 제거 — 충돌 회피 경로 명시됨.
- **테스트**: 순수 로직(import) 회귀는 `npm test`(T2), 나머지는 `tsc`/`build`/수동 확인 — 프로젝트의 기존 테스트 범위(lib/import만 vitest) 패턴을 따름.
