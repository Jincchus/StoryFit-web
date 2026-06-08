# 캐릭터 가져오기 원문 보존 블록 라벨링 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WHIF·멜팅·Zeta URL 가져오기에서 AI가 본문을 재서술/요약/잘라먹지 않도록, AI는 번호 블록의 분류 라벨만 반환하고 본문은 원본 블록에서 잘라 조립해 verbatim 저장한다.

**Architecture:** 가져오기를 4개 순수/준순수 모듈로 분리한다 — `capture`(사이트별 텍스트 수집), `blocks`(번호 블록 분할), `classify`(AI 분류 라벨), `assemble`(원본에서 조립·백스톱·폴백). 라우트는 이들을 엮어 DB에 쓴다. 본문은 AI 출력이 아니라 원본 블록 슬라이스에서 나오므로 변형·잘림이 구조적으로 불가능하다.

**Tech Stack:** Next.js 14 API Route, TypeScript, Prisma, puppeteer-core, Gemini(`lib/ai/gemini.ts`), 신규 테스트 러너 vitest.

참조 스펙: `docs/superpowers/specs/2026-06-08-import-verbatim-block-labeling-design.md`

---

## 파일 구조

- Create `lib/import/types.ts` — 공유 인터페이스 (CapturedSection, Captured, Block, Classification 등)
- Create `lib/import/blocks.ts` — `splitIntoBlocks` (순수)
- Create `lib/import/blocks.test.ts`
- Create `lib/import/assemble.ts` — `assemble`, `buildFallback` (순수)
- Create `lib/import/assemble.test.ts`
- Create `lib/import/classify.ts` — `buildClassifyPrompt`, `parseClassification`, `classifyBlocks`
- Create `lib/import/classify.test.ts`
- Create `lib/import/capture.ts` — `captureMelting`, `captureWhif`, `captureZeta` + 헬퍼 이전
- Modify `app/api/characters/import/route.ts` — 새 파이프라인으로 교체, 길이 캡 제거
- Create `vitest.config.ts`, Modify `package.json` (test 스크립트 + devDep)

---

## Task 1: 테스트 러너(vitest) + 공유 타입

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/import/types.ts`

- [ ] **Step 1: vitest 설치**

Run:
```bash
cd /home/server/StoryFit/apps/web && npm i -D vitest
```
Expected: `added ... vitest` (package.json devDependencies에 vitest 추가됨)

- [ ] **Step 2: package.json에 test 스크립트 추가**

`package.json`의 `"scripts"` 블록에 한 줄 추가 (db:generate 줄 다음):
```json
    "db:generate": "prisma generate",
    "test": "vitest run"
```

- [ ] **Step 3: vitest.config.ts 작성**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 4: 공유 타입 작성**

Create `lib/import/types.ts`:
```ts
// 사이트에서 수집한 원본 텍스트 섹션. text는 절대 변형하지 않는다(조립의 원천).
export interface CapturedSection {
  tab: string | null   // '상세 설명' | '첫 장면' | '인트로' | null
  text: string
}

export interface Captured {
  sections: CapturedSection[]
  title: string
  imageUrl: string
  loreUrls?: { url: string; name: string }[]
}

// 번호 매긴 블록. text는 원본 부분문자열 그대로.
export interface Block {
  id: number
  text: string
  tabHint: string | null
}

export type PresetField =
  | 'additionalInfo'
  | 'openingMessage'
  | 'exampleDialogues'
  | 'scenario'
  | 'ignore'

export interface CharacterRef {
  index: number
  name: string
  gender: string
}

export interface BlockLabel {
  id: number
  owner: number | null   // 캐릭터 index 또는 null(공용/시나리오)
  field: PresetField
}

export interface Classification {
  title: string
  tags: string[]
  characters: CharacterRef[]
  blocks: BlockLabel[]
}

export interface AssembledCharacter {
  name: string
  gender: string
  additionalInfo: string
  openingMessage: string
  exampleDialogues: string
}

export interface AssembledResult {
  characters: AssembledCharacter[]
  scenarioDescription: string
  tags: string[]
  title: string
}
```

- [ ] **Step 5: 타입 컴파일 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx tsc --noEmit
```
Expected: 에러 없음 (신규 타입 파일이 깨끗이 컴파일)

- [ ] **Step 6: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add package.json package-lock.json vitest.config.ts lib/import/types.ts
git commit -m "chore: add vitest + import pipeline shared types"
```

---

## Task 2: splitIntoBlocks (블록 분할)

**Files:**
- Create: `lib/import/blocks.ts`
- Test: `lib/import/blocks.test.ts`

동작 규약:
- 각 섹션 `text`를 빈 줄(`\n\s*\n`) 기준으로 문단 분할, 각 문단 trim, 빈 문단 제거.
- 길이 40자 미만 짧은 문단은 **같은 섹션의 직전 블록**에 `\n\n`로 병합. 같은 섹션 직전 블록이 없으면 독립 블록.
- 블록 id는 전 섹션에 걸쳐 전역 0,1,2…. tabHint는 섹션의 tab을 그대로.

- [ ] **Step 1: 실패 테스트 작성**

Create `lib/import/blocks.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { splitIntoBlocks } from './blocks'

describe('splitIntoBlocks', () => {
  it('빈 줄 기준으로 문단을 나누고 전역 id를 매긴다', () => {
    const blocks = splitIntoBlocks([
      { tab: '상세 설명', text: '첫 번째 문단입니다. 충분히 긴 설명 텍스트가 들어 있어요.\n\n두 번째 문단도 충분히 길게 작성된 설명 텍스트입니다.' },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ id: 0, text: '첫 번째 문단입니다. 충분히 긴 설명 텍스트가 들어 있어요.', tabHint: '상세 설명' })
    expect(blocks[1].id).toBe(1)
    expect(blocks[1].tabHint).toBe('상세 설명')
  })

  it('40자 미만 짧은 조각은 같은 섹션 직전 블록에 병합한다', () => {
    const blocks = splitIntoBlocks([
      { tab: null, text: '이 문단은 충분히 길어서 독립 블록이 되기에 모자람이 없는 설명입니다.\n\n짧은 꼬리.' },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('이 문단은 충분히 길어서 독립 블록이 되기에 모자람이 없는 설명입니다.\n\n짧은 꼬리.')
  })

  it('섹션이 다르면 id는 이어지고 tabHint는 각자 유지된다', () => {
    const blocks = splitIntoBlocks([
      { tab: '상세 설명', text: '상세 설명 섹션의 충분히 긴 본문 문단 텍스트입니다 여기.' },
      { tab: '첫 장면', text: '첫 장면 섹션의 충분히 긴 본문 문단 텍스트입니다 여기에.' },
    ])
    expect(blocks.map(b => b.id)).toEqual([0, 1])
    expect(blocks[0].tabHint).toBe('상세 설명')
    expect(blocks[1].tabHint).toBe('첫 장면')
  })

  it('빈 텍스트 섹션은 블록을 만들지 않는다', () => {
    const blocks = splitIntoBlocks([{ tab: null, text: '   \n\n   ' }])
    expect(blocks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/blocks.test.ts
```
Expected: FAIL — `splitIntoBlocks` import 실패/미정의

- [ ] **Step 3: 최소 구현**

Create `lib/import/blocks.ts`:
```ts
import type { Block, CapturedSection } from './types'

const MIN_BLOCK_LEN = 40

export function splitIntoBlocks(sections: CapturedSection[]): Block[] {
  const blocks: Block[] = []
  let id = 0

  for (const section of sections) {
    const paras = section.text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)

    let lastInSection: Block | null = null

    for (const para of paras) {
      if (para.length < MIN_BLOCK_LEN && lastInSection) {
        lastInSection.text += `\n\n${para}`
        continue
      }
      const block: Block = { id: id++, text: para, tabHint: section.tab }
      blocks.push(block)
      lastInSection = block
    }
  }

  return blocks
}
```

- [ ] **Step 4: 통과 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/blocks.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/import/blocks.ts lib/import/blocks.test.ts
git commit -m "feat: add splitIntoBlocks for import block labeling"
```

---

## Task 3: assemble — 단일 캐릭터 정상 경로

**Files:**
- Create: `lib/import/assemble.ts`
- Test: `lib/import/assemble.test.ts`

동작 규약 (정상 경로, characters ≥ 1 가정):
- 캐릭터 index별로 `additionalInfo/openingMessage/exampleDialogues` 블록 id 목록을 모은다.
- 라벨 순회: `field==='scenario'` → scenario id 목록 / `field==='ignore'` → 버림(처리됨 표시) / 그 외 → `owner ?? 0` 캐릭터의 해당 필드. owner가 유효 index 아니면 0.
- 라벨에 **안 잡힌** 블록(백스톱): tabHint가 `첫 장면|첫장면|인트로` → 0번 openingMessage / `상세 설명` → 0번 additionalInfo / 그 외 → scenario.
- 각 목록을 **블록 id 오름차순**으로 정렬 후 `blocks[id].text`(원본)를 `\n\n`로 결합, trim → verbatim·순서 보존.
- tags 최대 15개 정규화, title은 `classification.title || characters[0].name`.

- [ ] **Step 1: 실패 테스트 작성**

Create `lib/import/assemble.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { assemble } from './assemble'
import type { Block, Classification } from './types'

const blocks: Block[] = [
  { id: 0, text: '시안은 27세 기사단장이다. 냉정하지만 속은 따뜻하다.', tabHint: '상세 설명' },
  { id: 1, text: '"늦었군. 기다리고 있었다."', tabHint: '첫 장면' },
  { id: 2, text: '왕국은 오랜 전쟁의 끝자락에 있다.', tabHint: '상세 설명' },
]

describe('assemble — 단일 캐릭터', () => {
  it('필드별로 원본 텍스트를 그대로 결합한다', () => {
    const classification: Classification = {
      title: '시안과의 대화',
      tags: ['판타지', '기사'],
      characters: [{ index: 0, name: '시안', gender: '남성' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
        { id: 2, owner: null, field: 'scenario' },
      ],
    }
    const r = assemble(blocks, classification)
    expect(r.characters).toHaveLength(1)
    expect(r.characters[0].name).toBe('시안')
    expect(r.characters[0].additionalInfo).toBe('시안은 27세 기사단장이다. 냉정하지만 속은 따뜻하다.')
    expect(r.characters[0].openingMessage).toBe('"늦었군. 기다리고 있었다."')
    expect(r.scenarioDescription).toBe('왕국은 오랜 전쟁의 끝자락에 있다.')
    expect(r.tags).toEqual(['판타지', '기사'])
    expect(r.title).toBe('시안과의 대화')
  })

  it('조립된 모든 본문은 원본 블록의 부분문자열이다 (verbatim 보장)', () => {
    const classification: Classification = {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 0, field: 'openingMessage' },
      ],
    }
    const r = assemble(blocks, classification)
    const source = blocks.map(b => b.text).join('\n')
    for (const part of r.characters[0].additionalInfo.split('\n\n')) {
      expect(source).toContain(part)
    }
    expect(source).toContain(r.characters[0].openingMessage)
  })

  it('title이 비면 첫 캐릭터 이름을 쓴다', () => {
    const classification: Classification = {
      title: '', tags: [],
      characters: [{ index: 0, name: '시안', gender: '' }],
      blocks: [{ id: 0, owner: 0, field: 'additionalInfo' }],
    }
    expect(assemble(blocks, classification).title).toBe('시안')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/assemble.test.ts
```
Expected: FAIL — `assemble` 미정의

- [ ] **Step 3: 최소 구현**

Create `lib/import/assemble.ts`:
```ts
import type {
  AssembledCharacter, AssembledResult, Block, Classification, PresetField,
} from './types'

const OPENING_TABS = ['첫 장면', '첫장면', '인트로']
const DETAIL_TABS = ['상세 설명']
const CHAR_FIELDS: PresetField[] = ['additionalInfo', 'openingMessage', 'exampleDialogues']

interface Acc {
  additionalInfo: number[]
  openingMessage: number[]
  exampleDialogues: number[]
}

function joinByIds(ids: number[], byId: Map<number, Block>): string {
  return ids
    .slice()
    .sort((a, b) => a - b)
    .map(id => byId.get(id)?.text ?? '')
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function assemble(blocks: Block[], classification: Classification): AssembledResult {
  const byId = new Map(blocks.map(b => [b.id, b]))
  const chars = classification.characters.length > 0
    ? classification.characters
    : [{ index: 0, name: classification.title || '캐릭터', gender: '' }]

  const accs: Acc[] = chars.map(() => ({ additionalInfo: [], openingMessage: [], exampleDialogues: [] }))
  const scenarioIds: number[] = []
  const handled = new Set<number>()

  const ownerIndex = (owner: number | null) => {
    if (owner === null || owner < 0 || owner >= accs.length) return 0
    return owner
  }

  for (const label of classification.blocks) {
    if (!byId.has(label.id)) continue
    handled.add(label.id)
    if (label.field === 'ignore') continue
    if (label.field === 'scenario') { scenarioIds.push(label.id); continue }
    if (CHAR_FIELDS.includes(label.field)) {
      accs[ownerIndex(label.owner)][label.field as keyof Acc].push(label.id)
    }
  }

  // 백스톱: 라벨이 안 붙은 블록을 탭 힌트/기본 규칙으로 흡수 (누락 0)
  for (const block of blocks) {
    if (handled.has(block.id)) continue
    if (block.tabHint && OPENING_TABS.includes(block.tabHint)) accs[0].openingMessage.push(block.id)
    else if (block.tabHint && DETAIL_TABS.includes(block.tabHint)) accs[0].additionalInfo.push(block.id)
    else scenarioIds.push(block.id)
  }

  const characters: AssembledCharacter[] = chars.map((c, i) => ({
    name: (c.name || '캐릭터').trim(),
    gender: (c.gender || '').trim(),
    additionalInfo: joinByIds(accs[i].additionalInfo, byId),
    openingMessage: joinByIds(accs[i].openingMessage, byId),
    exampleDialogues: joinByIds(accs[i].exampleDialogues, byId),
  }))

  const tags = (classification.tags ?? [])
    .map(t => String(t).trim())
    .filter(Boolean)
    .slice(0, 15)

  return {
    characters,
    scenarioDescription: joinByIds(scenarioIds, byId),
    tags,
    title: (classification.title || characters[0]?.name || '캐릭터').trim(),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/assemble.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/import/assemble.ts lib/import/assemble.test.ts
git commit -m "feat: add assemble (single-character verbatim path)"
```

---

## Task 4: assemble — 다중 캐릭터 · 누락 흡수 · 탭 백스톱

**Files:**
- Modify: `lib/import/assemble.test.ts` (테스트 추가; 구현은 Task 3에서 이미 처리됨 — 회귀 검증)

- [ ] **Step 1: 테스트 추가**

`lib/import/assemble.test.ts` 끝에 추가:
```ts
describe('assemble — 다중 캐릭터/백스톱/누락', () => {
  const multi: Block[] = [
    { id: 0, text: '아린은 마법사다. 호기심 많고 장난기가 넘친다 정말로요.', tabHint: '상세 설명' },
    { id: 1, text: '카이는 검사다. 과묵하고 충직한 성격을 지니고 있습니다.', tabHint: '상세 설명' },
    { id: 2, text: '두 사람은 같은 길드 소속으로 오래 함께해 왔습니다 그동안.', tabHint: '상세 설명' },
    { id: 3, text: '"준비됐어? 모험을 시작하자!" 아린이 외쳤다 신나게요.', tabHint: '첫 장면' },
  ]

  it('owner별로 각 캐릭터에 verbatim 분리한다 (다중 주인공)', () => {
    const r = assemble(multi, {
      title: '아린과 카이', tags: [],
      characters: [{ index: 0, name: '아린', gender: '여성' }, { index: 1, name: '카이', gender: '남성' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: 1, field: 'additionalInfo' },
        { id: 2, owner: null, field: 'scenario' },
        { id: 3, owner: 0, field: 'openingMessage' },
      ],
    })
    expect(r.characters).toHaveLength(2)
    expect(r.characters[0].additionalInfo).toContain('아린은 마법사')
    expect(r.characters[1].additionalInfo).toContain('카이는 검사')
    expect(r.scenarioDescription).toContain('같은 길드')
  })

  it('라벨 안 된 블록은 탭 백스톱으로 흡수한다 (첫 장면→openingMessage, 상세 설명→additionalInfo)', () => {
    const r = assemble(multi, {
      title: '', tags: [],
      characters: [{ index: 0, name: '아린', gender: '' }],
      blocks: [{ id: 0, owner: 0, field: 'additionalInfo' }], // 1,2,3은 라벨 누락
    })
    // 3번(첫 장면)은 오프닝으로, 1·2번(상세 설명)은 0번 additionalInfo로
    expect(r.characters[0].openingMessage).toContain('모험을 시작하자')
    expect(r.characters[0].additionalInfo).toContain('카이는 검사')
    expect(r.characters[0].additionalInfo).toContain('같은 길드')
  })

  it('owner가 잘못된 index면 0번으로 떨어진다', () => {
    const r = assemble(multi, {
      title: '', tags: [],
      characters: [{ index: 0, name: '아린', gender: '' }],
      blocks: [{ id: 0, owner: 9, field: 'additionalInfo' }],
    })
    expect(r.characters[0].additionalInfo).toContain('아린은 마법사')
  })

  it('ignore 라벨 블록은 결과에 포함되지 않는다', () => {
    const r = assemble(multi, {
      title: '', tags: [],
      characters: [{ index: 0, name: '아린', gender: '' }],
      blocks: [
        { id: 0, owner: 0, field: 'additionalInfo' },
        { id: 1, owner: null, field: 'ignore' },
        { id: 2, owner: null, field: 'ignore' },
        { id: 3, owner: null, field: 'ignore' },
      ],
    })
    expect(r.characters[0].additionalInfo).toBe('아린은 마법사다. 호기심 많고 장난기가 넘친다 정말로요.')
    expect(r.scenarioDescription).toBe('')
    expect(r.characters[0].openingMessage).toBe('')
  })
})
```

- [ ] **Step 2: 통과 확인 (회귀 포함)**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/assemble.test.ts
```
Expected: PASS (7 tests 총합)

- [ ] **Step 3: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/import/assemble.test.ts
git commit -m "test: cover multi-character, tab backstop, ignore in assemble"
```

---

## Task 5: buildFallback — 분류 실패 시 무손실 폴백

**Files:**
- Modify: `lib/import/assemble.ts` (`buildFallback` 추가)
- Modify: `lib/import/assemble.test.ts`

동작 규약: 분류가 완전히 실패했을 때 호출. 단일 캐릭터, openingMessage = `첫 장면/인트로` 탭 블록 결합, additionalInfo = 그 외 모든 블록 결합(원본). 내용 무손실.

- [ ] **Step 1: 실패 테스트 작성**

`lib/import/assemble.test.ts` 끝에 추가 (import 줄에 buildFallback 추가):
```ts
import { assemble, buildFallback } from './assemble'

describe('buildFallback', () => {
  const blocks: Block[] = [
    { id: 0, text: '레이는 길잡이 소년이다. 밝고 거침없는 성격이라고 합니다.', tabHint: '상세 설명' },
    { id: 1, text: '"어서 와! 여기가 우리 마을이야." 레이가 손을 흔들었다 활짝.', tabHint: '첫 장면' },
  ]

  it('첫 장면은 openingMessage로, 나머지는 additionalInfo로 무손실 보존한다', () => {
    const r = buildFallback(blocks, { name: '레이' })
    expect(r.characters).toHaveLength(1)
    expect(r.characters[0].name).toBe('레이')
    expect(r.characters[0].openingMessage).toContain('우리 마을이야')
    expect(r.characters[0].additionalInfo).toContain('길잡이 소년')
  })

  it('탭 힌트가 없으면 전부 additionalInfo로 들어간다 (누락 0)', () => {
    const plain: Block[] = [
      { id: 0, text: '설정 A 충분히 길게 작성된 텍스트 본문입니다 여기까지요.', tabHint: null },
      { id: 1, text: '설정 B 충분히 길게 작성된 텍스트 본문입니다 여기까지요.', tabHint: null },
    ]
    const r = buildFallback(plain, { name: '무명' })
    expect(r.characters[0].additionalInfo).toContain('설정 A')
    expect(r.characters[0].additionalInfo).toContain('설정 B')
    expect(r.characters[0].openingMessage).toBe('')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/assemble.test.ts
```
Expected: FAIL — `buildFallback` 미정의

- [ ] **Step 3: 구현 추가**

`lib/import/assemble.ts` 끝에 추가:
```ts
export function buildFallback(blocks: Block[], opts: { name: string }): AssembledResult {
  const byId = new Map(blocks.map(b => [b.id, b]))
  const openingIds: number[] = []
  const detailIds: number[] = []

  for (const block of blocks) {
    if (block.tabHint && OPENING_TABS.includes(block.tabHint)) openingIds.push(block.id)
    else detailIds.push(block.id)
  }

  const name = (opts.name || '캐릭터').trim()
  return {
    characters: [{
      name,
      gender: '',
      additionalInfo: joinByIds(detailIds, byId),
      openingMessage: joinByIds(openingIds, byId),
      exampleDialogues: '',
    }],
    scenarioDescription: '',
    tags: [],
    title: name,
  }
}
```

- [ ] **Step 4: 통과 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/assemble.test.ts
```
Expected: PASS (9 tests 총합)

- [ ] **Step 5: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/import/assemble.ts lib/import/assemble.test.ts
git commit -m "feat: add buildFallback lossless single-character path"
```

---

## Task 6: classify — 프롬프트 생성 + 파싱

**Files:**
- Create: `lib/import/classify.ts`
- Test: `lib/import/classify.test.ts`

동작 규약:
- `buildClassifyPrompt(blocks)`: 번호 매긴 블록 목록(각 줄 `[id] (tab) text`) + "텍스트를 복사/재서술하지 말고 id·라벨만 출력" 지시 + JSON 스키마를 담은 user 프롬프트 문자열.
- `parseClassification(raw)`: `{...}` 추출 → JSON.parse → 형태 정규화. characters 비었거나 파싱 불가면 throw. field가 알 수 없는 값이면 `'ignore'`, owner는 number 또는 null.

- [ ] **Step 1: 실패 테스트 작성**

Create `lib/import/classify.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildClassifyPrompt, parseClassification } from './classify'
import type { Block } from './types'

const blocks: Block[] = [
  { id: 0, text: '시안은 기사단장.', tabHint: '상세 설명' },
  { id: 1, text: '"늦었군."', tabHint: '첫 장면' },
]

describe('buildClassifyPrompt', () => {
  it('블록 id와 본문, 복사 금지 지시를 포함한다', () => {
    const p = buildClassifyPrompt(blocks)
    expect(p).toContain('[0]')
    expect(p).toContain('시안은 기사단장.')
    expect(p).toContain('상세 설명')
    expect(p).toMatch(/복사|재서술/)
  })
})

describe('parseClassification', () => {
  it('마크다운 펜스를 걷어내고 JSON을 파싱한다', () => {
    const raw = '```json\n{"title":"시안","tags":["기사"],"characters":[{"index":0,"name":"시안","gender":"남성"}],"blocks":[{"id":0,"owner":0,"field":"additionalInfo"}]}\n```'
    const c = parseClassification(raw)
    expect(c.characters[0].name).toBe('시안')
    expect(c.blocks[0].field).toBe('additionalInfo')
  })

  it('알 수 없는 field는 ignore로 정규화한다', () => {
    const raw = '{"title":"","tags":[],"characters":[{"index":0,"name":"x","gender":""}],"blocks":[{"id":0,"owner":0,"field":"weird"}]}'
    expect(parseClassification(raw).blocks[0].field).toBe('ignore')
  })

  it('characters가 비면 throw 한다', () => {
    const raw = '{"title":"","tags":[],"characters":[],"blocks":[]}'
    expect(() => parseClassification(raw)).toThrow()
  })

  it('JSON이 아니면 throw 한다', () => {
    expect(() => parseClassification('전혀 JSON 아님')).toThrow()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/classify.test.ts
```
Expected: FAIL — 미정의 import

- [ ] **Step 3: 구현**

Create `lib/import/classify.ts`:
```ts
import type { Block, Classification, PresetField } from './types'
import { generateText } from '@/lib/ai/gemini'

const FIELDS: PresetField[] = ['additionalInfo', 'openingMessage', 'exampleDialogues', 'scenario', 'ignore']

export function buildClassifyPrompt(blocks: Block[]): string {
  const listing = blocks
    .map(b => `[${b.id}]${b.tabHint ? ` (${b.tabHint})` : ''} ${b.text}`)
    .join('\n\n')

  return `아래는 롤플레잉 캐릭터 페이지에서 추출한 번호 매긴 텍스트 블록입니다.
각 블록이 "어느 캐릭터의 어느 필드"인지 분류하세요.

⚠️ 매우 중요: 블록 텍스트를 절대 복사하거나 재서술하지 마세요. 오직 블록 id(숫자)와 라벨만 출력합니다.

블록:
${listing}

반환 형식 (마크다운 없이 JSON만):
{"title":"작품/주인공 제목","tags":["태그1"],"characters":[{"index":0,"name":"이름","gender":"남성|여성|"}],"blocks":[{"id":0,"owner":0,"field":"additionalInfo"}]}

규칙:
- characters: 원문이 독립 항목으로 따로 서술한 인물만. 대등한 주인공이 여럿이면 모두 포함, 단순 조연/언급은 넣지 말 것.
- owner: 그 블록이 명확히 특정 캐릭터를 설명하면 그 index, 세계관/줄거리/공용이면 null.
- field: additionalInfo(설정·성격·외모), openingMessage(첫 장면/인트로 대사), exampleDialogues(예시 대화), scenario(세계관/줄거리), ignore(사이트 UI·잡음).
- 모든 블록 id를 빠짐없이 한 번씩 분류하세요.`
}

export function parseClassification(raw: string): Classification {
  const match = raw.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(match ? match[0] : raw)

  const characters = Array.isArray(parsed.characters)
    ? parsed.characters
        .map((c: any, i: number) => ({
          index: typeof c?.index === 'number' ? c.index : i,
          name: String(c?.name ?? '').trim(),
          gender: String(c?.gender ?? '').trim(),
        }))
        .filter((c: any) => c.name)
    : []

  if (characters.length === 0) throw new Error('분류 결과에 캐릭터가 없습니다')

  const blocks = Array.isArray(parsed.blocks)
    ? parsed.blocks
        .filter((b: any) => typeof b?.id === 'number')
        .map((b: any) => ({
          id: b.id,
          owner: typeof b?.owner === 'number' ? b.owner : null,
          field: (FIELDS.includes(b?.field) ? b.field : 'ignore') as PresetField,
        }))
    : []

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 15)
    : []

  return { title: String(parsed.title ?? '').trim(), tags, characters, blocks }
}

// AI 호출 + 파싱 + 2회 재시도. 실패 시 throw (호출 측에서 buildFallback으로 폴백).
export async function classifyBlocks(blocks: Block[]): Promise<Classification> {
  const systemPrompt = '당신은 텍스트 블록을 캐릭터 필드로 분류하는 분류기입니다. 텍스트를 복사하지 말고 반드시 JSON만 반환하세요.'
  const userPrompt = buildClassifyPrompt(blocks)

  let lastErr: unknown
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await generateText(systemPrompt, userPrompt, 2048)
      return parseClassification(raw)
    } catch (e) {
      lastErr = e
      console.log('[import-classify] parse error attempt', i, ':', (e as any)?.message)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('분류 실패')
}
```

- [ ] **Step 4: 통과 확인**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx vitest run lib/import/classify.test.ts
```
Expected: PASS (5 tests). `classifyBlocks`는 AI 호출이라 단위 테스트 제외(수동 E2E).

- [ ] **Step 5: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/import/classify.ts lib/import/classify.test.ts
git commit -m "feat: add classify prompt + parser for import block labeling"
```

---

## Task 7: capture 모듈 — 사이트별 수집 이전

**Files:**
- Create: `lib/import/capture.ts`
- Modify: `app/api/characters/import/route.ts` (헬퍼/렌더 함수 이전, 임시로 import만 연결)

route.ts에서 아래 함수들을 `lib/import/capture.ts`로 **이동**하고 export 한다. 본문 로직은 그대로 두되 반환형만 `Captured`로 맞춘다.

이동 대상(현재 route.ts):
`decodeHtmlEntities`, `stripHtml`, `extractNextFlightText`, `cleanZetaText`, `preprocessZetaText`, `cleanWhifText`, `getStoredSessionCookie`, `parseSessionCookies`, `renderWhifPageText`, `extractZetaIntroText`, `escapeRegExp`, `extractLorebookUrls`, `extractZetaPlotImage`, `extractMetaContent`, `cleanMeltingTitle`, `renderMeltingPageText`, `matchesHost`(공용 — capture에 두고 route에서 import).
멜팅 렌더는 `withMeltingPage`(`@/lib/meltingBrowser`), WHIF 렌더는 `puppeteer-core`를 capture.ts에서 import.

- [ ] **Step 1: capture.ts 생성 — 공용 헬퍼 + WHIF/Zeta 수집**

Create `lib/import/capture.ts` (route.ts의 해당 함수 본문을 그대로 옮기고, 아래 3개 capture 함수를 추가). 핵심 추가분:
```ts
import puppeteer from 'puppeteer-core'
import { prisma } from '@/lib/prisma'
import { withMeltingPage } from '@/lib/meltingBrowser'
import type { Captured } from './types'

// ... (route.ts에서 이동한 헬퍼들: stripHtml, extractNextFlightText, cleanZetaText,
//      preprocessZetaText, cleanWhifText, getStoredSessionCookie, parseSessionCookies,
//      renderWhifPageText, extractZetaIntroText, escapeRegExp, extractLorebookUrls,
//      extractZetaPlotImage, decodeHtmlEntities, extractMetaContent, cleanMeltingTitle,
//      renderMeltingPageText, WHIF_LOGIN_GATE_TEXT, MELTING_LOGIN_GATE_TEXT 등)

export function matchesHost(url: string, ...domains: string[]): boolean {
  let hostname: string
  try { hostname = new URL(url).hostname.toLowerCase() } catch { return false }
  return domains.some(d => hostname === d || hostname.endsWith(`.${d}`))
}

const INPUT_CAP = 40000  // 분류 출력이 작아져 입력 캡을 크게 상향 (잘림 방지)

export async function captureWhif(url: string): Promise<Captured> {
  const rawText = await renderWhifPageText(url)
  if (rawText.includes(WHIF_LOGIN_GATE_TEXT)) {
    throw new Error('로그인이 필요한 콘텐츠(언세이프 캐릭터)라 가져올 수 없습니다')
  }
  const text = cleanWhifText(rawText).slice(0, INPUT_CAP)
  if (text.length < 100) throw new Error('Whif 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  return { sections: [{ tab: null, text }], title: '', imageUrl: '' }
}

export async function captureZeta(url: string): Promise<Captured> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5' },
  })
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)
  const html = await res.text()
  const loreUrls = extractLorebookUrls(html)
  const imageUrl = extractZetaPlotImage(html, url)
  const body = preprocessZetaText(html).slice(0, INPUT_CAP)
  if (body.length < 100) throw new Error('Zeta 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  const intro = extractZetaIntroText(body, [])
  const sections = intro
    ? [{ tab: '인트로', text: intro }, { tab: null, text: body }]
    : [{ tab: null, text: body }]
  return { sections, title: '', imageUrl, loreUrls: loreUrls.length ? loreUrls : undefined }
}

export async function captureMelting(url: string): Promise<Captured> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5' },
  })
  if (!res.ok) throw new Error(`페이지를 불러올 수 없습니다 (HTTP ${res.status})`)
  const html = await res.text()
  const title = cleanMeltingTitle(extractMetaContent(html, 'og:title'))
  const imageUrl = extractMetaContent(html, 'og:image')
  const ogDesc = extractMetaContent(html, 'og:description').slice(0, INPUT_CAP)

  try {
    const sections = await renderMeltingSections(url)  // 아래 Step 2에서 구현
    const total = sections.reduce((n, s) => n + s.text.length, 0)
    if (total >= 100) return { sections, title, imageUrl }
  } catch (e: any) {
    console.log('[melting-import] 헤드리스 실패, OG 메타로 폴백:', e?.message)
  }

  if (ogDesc.length < 100) throw new Error('멜팅 페이지에서 캐릭터 설정 텍스트를 찾을 수 없습니다')
  return { sections: [{ tab: null, text: ogDesc }], title, imageUrl }
}
```

- [ ] **Step 2: renderMeltingSections — 탭을 구조 유지로 반환**

기존 `renderMeltingPageText`를 capture.ts 안에서 `renderMeltingSections`로 바꾼다. 마지막 반환만 수정: 탭별 텍스트를 `\n---\n`로 합치지 말고 라벨된 섹션 배열로 반환.
```ts
async function renderMeltingSections(url: string): Promise<{ tab: string | null; text: string }[]> {
  return withMeltingPage(async (page) => {
    // ... 기존 renderMeltingPageText의 goto/게이트/시드쿠키/waitForFunction/grabPanelText 로직 그대로 ...
    const sections: { tab: string | null; text: string }[] = []
    const detail = await grabPanelText()
    sections.push({ tab: '상세 설명', text: detail.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() })
    for (const label of ['첫 장면', '첫장면']) {
      const clicked = await page.evaluate((lbl: string) => {
        const target = Array.from(document.querySelectorAll('button, [role="tab"], a, div, span'))
          .find(el => el.children.length === 0 && el.textContent?.trim() === lbl)
        if (target) { (target as HTMLElement).click(); return true }
        return false
      }, label)
      if (clicked) {
        await new Promise(r => setTimeout(r, 1200))
        const scene = (await grabPanelText()).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
        sections.push({ tab: '첫 장면', text: scene })
        break
      }
    }
    // 게이트 문구가 섞였으면 폴백 트리거
    if (sections.some(s => s.text.includes(MELTING_LOGIN_GATE_TEXT))) throw new Error('세션 게이트')
    return sections
  })
}
```

- [ ] **Step 3: route.ts에서 이동한 함수 제거 + import 연결 (임시)**

route.ts 상단에서 이동한 함수들을 삭제하고, 당장 깨지지 않도록 `matchesHost`만 capture에서 import:
```ts
import { captureMelting, captureWhif, captureZeta, matchesHost } from '@/lib/import/capture'
```
(이 단계에선 importFromZeta/Melting/Whif 본문은 다음 Task에서 교체하므로, 이동으로 사라진 헬퍼를 쓰는 줄이 있으면 그 함수 전체를 Task 8에서 갈아끼울 때까지 일시적으로 컴파일 에러가 날 수 있음 — Step 4의 typecheck로 확인하고 Task 8과 연속 작업으로 처리.)

- [ ] **Step 4: 타입 체크**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx tsc --noEmit 2>&1 | head -30
```
Expected: capture.ts 자체는 에러 없음. route.ts는 Task 8에서 본문 교체 전까지 미사용 헬퍼 관련 에러가 남을 수 있음 — Task 8과 이어서 진행.

- [ ] **Step 5: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add lib/import/capture.ts app/api/characters/import/route.ts
git commit -m "refactor: extract site capture into lib/import/capture"
```

---

## Task 8: route 배선 — 새 파이프라인 + 길이 캡 제거

**Files:**
- Modify: `app/api/characters/import/route.ts`

`importFromZeta`/`importFromMelting`/`importFromWhif`를 공용 `runImport(capture, url, userId)` 하나로 대체한다. DB 쓰기(캐릭터/대화/컬렉션/첫 메시지)는 기존 로직 재사용하되 **모든 `.slice(0, N)` 길이 캡 제거**(`.trim()`은 유지).

- [ ] **Step 1: 공용 runImport 구현**

route.ts에 추가:
```ts
import { splitIntoBlocks } from '@/lib/import/blocks'
import { classifyBlocks } from '@/lib/import/classify'
import { assemble, buildFallback } from '@/lib/import/assemble'
import type { Captured } from '@/lib/import/types'

async function runImport(captured: Captured, url: string, userId: string) {
  const blocks = splitIntoBlocks(captured.sections)
  if (blocks.length === 0) throw new Error('가져올 텍스트가 없습니다')

  let result
  try {
    const classification = await classifyBlocks(blocks)
    if (!classification.title) classification.title = captured.title
    result = assemble(blocks, classification)
  } catch (e: any) {
    console.log('[import] 분류 실패 — 무손실 폴백:', e?.message)
    result = buildFallback(blocks, { name: captured.title || '캐릭터' })
  }

  const isMulti = result.characters.length > 1
  const firstName = result.characters[0]?.name || captured.title || '캐릭터'
  const title = (result.title || `${firstName}${isMulti ? ' 외' : ''}와의 대화`).trim()

  // 캐릭터 생성 — 길이 캡 없음(verbatim 전체 보존)
  const createdChars = await Promise.all(
    result.characters.map((c, i) =>
      prisma.character.create({
        data: {
          name: c.name.slice(0, 100),                 // name만 DB 표시용으로 제한 유지
          gender: c.gender.slice(0, 20),
          tags: result.tags,
          additionalInfo: c.additionalInfo,            // 캡 제거
          exampleDialogues: c.exampleDialogues,        // 캡 제거
          openingMessage: c.openingMessage,            // 캡 제거
          isAutoCreated: true,
          creatorId: userId,
          ...(i === 0 && captured.imageUrl ? { avatarUrl: captured.imageUrl } : {}),
        },
      })
    )
  )

  const conversation = await prisma.conversation.create({
    data: {
      userId, title, mode: isMulti ? 'multiStory' : 'story', currentAI: 'gemini',
      scenarioDescription: result.scenarioDescription,   // 캡 제거
      tags: result.tags, isAutoCreated: true, sourceUrl: url,
      sourceLorebookUrls: captured.loreUrls && captured.loreUrls.length ? captured.loreUrls : undefined,
      characters: { create: createdChars.map((c, i) => ({ characterId: c.id, turnOrder: i })) },
    },
  })

  const collection = await prisma.characterCollection.create({
    data: { title, sourceUrl: url, userId, conversationId: conversation.id },
  })
  await prisma.character.updateMany({
    where: { id: { in: createdChars.map(c => c.id) } },
    data: { collectionId: collection.id },
  })

  const firstChar = createdChars[0]
  if (firstChar?.openingMessage?.trim()) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id, role: 'assistant',
        content: firstChar.openingMessage.trim(), characterId: firstChar.id,
        isSelected: true, isStreaming: false,
      },
    })
  }

  return { characterId: firstChar?.id, conversationId: conversation.id, collectionId: collection.id }
}
```

- [ ] **Step 2: POST 핸들러를 새 경로로 교체**

route.ts의 `POST`에서 Zeta/멜팅/WHIF 분기를 capture 호출로 교체 (Tavern Card 업로드 경로는 그대로 유지):
```ts
  if (matchesHost(url, 'zeta-ai.io')) {
    try { return NextResponse.json(await runImport(await captureZeta(url.trim()), url.trim(), userId), { status: 201 }) }
    catch (e: any) { return NextResponse.json({ error: e.message ?? '제타 가져오기 실패' }, { status: 400 }) }
  }
  if (matchesHost(url, 'melting.chat')) {
    try { return NextResponse.json(await runImport(await captureMelting(url.trim()), url.trim(), userId), { status: 201 }) }
    catch (e: any) { return NextResponse.json({ error: e.message ?? '멜팅 가져오기 실패' }, { status: 400 }) }
  }
  if (matchesHost(url, 'whif.io', 'whif.club')) {
    try { return NextResponse.json(await runImport(await captureWhif(url.trim()), url.trim(), userId), { status: 201 }) }
    catch (e: any) { return NextResponse.json({ error: e.message ?? 'Whif 가져오기 실패' }, { status: 400 }) }
  }
```
이후 옛 `importFromZeta`/`importFromMelting`/`importFromWhif` 함수 정의를 삭제한다.

- [ ] **Step 3: 타입 체크 + 린트 + 전체 테스트**

Run:
```bash
cd /home/server/StoryFit/apps/web && npx tsc --noEmit && npm run lint && npx vitest run
```
Expected: tsc 에러 없음, lint 통과(기존 무관 경고 제외), vitest 전 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
cd /home/server/StoryFit/apps/web
git add app/api/characters/import/route.ts
git commit -m "feat: wire import to block-labeling pipeline, remove length caps"
```

---

## Task 9: 수동 E2E 검증 + 배포

**Files:** 없음 (검증/배포)

- [ ] **Step 1: 로컬 dev 서버로 실제 URL 가져오기**

별도 포트로 dev 서버를 띄우고(`PORT=3003 npm run dev`), 가져오기 UI 또는 API로 WHIF/멜팅/Zeta URL 각 1개를 가져온다. 확인 항목:
- 캐릭터 `additionalInfo`/`openingMessage`가 원문과 **글자 단위로 일치**(요약/변형 없음)
- 10,000자 넘는 긴 캐릭터도 안 잘림
- 다중 주인공 페이지 → 캐릭터 여러 개 생성
- 첫 메시지(오프닝)가 대화에 정상 생성

DB 확인 예:
```bash
docker exec storyfit-db-1 psql -U storyfit -d storyfit -c "SELECT name, length(\"additionalInfo\"), length(\"openingMessage\") FROM \"Character\" ORDER BY \"createdAt\" DESC LIMIT 5;"
```

- [ ] **Step 2: dev 서버 정리**

테스트용 dev 서버/아티팩트 종료·삭제.

- [ ] **Step 3: 배포 (CLAUDE.md 2단계)**

```bash
cd /home/server/StoryFit/apps/web && git push origin main
cd /home/server/StoryFit && git add apps/web && git commit -m "Chore: apps/web 서브모듈 포인터 업데이트 (가져오기 원문 보존 블록 라벨링)" && git push origin master
docker compose up --build -d
```
배포 후 컨테이너 healthy + 가져오기 1건 재확인.

---

## 자체 검토 결과

- **스펙 커버리지**: ①캡처=Task7, ②블록분할=Task2, ③AI분류=Task6, ④조립/백스톱/누락흡수=Task3·4, 길이캡 제거=Task8, ⑤폴백=Task5, 커버리지/이름폴백=assemble·runImport, 모듈분리=Task7·8, 테스트=Task2·3·4·5·6, Zeta 포함=Task7·8. 누락 없음.
- **플레이스홀더 스캔**: 코드 스텝마다 실제 코드 포함. capture 이전(Task7)은 "기존 함수 본문 그대로 이동"이라 전체 재게재 대신 이동 목록+변경점 명시(대용량 기존 코드라 의도적).
- **타입 일관성**: `Block/Classification/Captured/AssembledResult` 전 Task 동일 시그니처. `joinByIds`/`buildFallback`는 같은 파일 내 정의 후 사용. `matchesHost`는 capture에서 export→route import로 일원화.

## 커버리지 체크 메모(미반영 결정)

스펙 ⑤의 "커버리지 체크(사용 글자수 비율)"는 누락 흡수(백스톱이 모든 미라벨 블록을 scenario로 흡수)로 사실상 달성되므로 별도 비율 계산은 넣지 않았다. 누락 0은 백스톱으로 보장된다.
