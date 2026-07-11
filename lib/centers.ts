// 외부 가져오기 센터의 단일 소스(Single Source of Truth).
//
// 새 센터를 추가할 때 가장 먼저 이 배열에 항목을 추가한다. 아래 소비처들이 이 배열을 순회하므로
// 한 곳만 고치면 목록·라우팅·API 필터·Dock 하이라이트가 함께 갱신된다:
//   - app/api/collections/route.ts   (isXxx=true 쿼리 → sourceUrl 호스트 필터)
//   - components/shell/Dock.tsx       (탐색 탭 active 판정)
//   - app/(main)/explore/page.tsx     (센터 카드 그리드)
//   - app/(main)/page.tsx             (홈 "외부 가져오기" 목록)
//
// ⚠ 이 배열이 자동으로 처리하지 '못'하는 것(센터 추가 시 수동 작업): 라우트 그룹 디렉터리
//   `app/(key)/key/...`, 레이아웃, CSS 변수/클래스, import 캡처 함수(lib/import/*),
//   import 라우트의 matchesHost 분기, guide 페이지. 전체 체크리스트는
//   context/adding-a-center.md 참고.

export interface CenterDef {
  /** 라우트/식별 키. 디렉터리 `app/(key)/key/` 와 일치. */
  key: string
  /** 화면 표시 라벨 (브랜드 표기). 예: 'WHIF', 'rofanai' */
  label: string
  /** 대표 도메인 (홈 라벨 표기용). 예: 'whif.io' */
  domain: string
  /** 라우트 경로. 예: '/whif' */
  path: string
  emoji: string
  /** 카드 배경 그라데이션 */
  grad: string
  /** 한 줄 설명 (탐색·홈 카드 공용) */
  desc: string

  /** collections API: sourceUrl `contains` 부분 문자열(이 센터로 분류되는 호스트). */
  dbHosts: string[]
  /** import 라우트 matchesHost용 전체 호스트네임(참고용 — import 라우트가 직접 사용하진 않음). */
  importHosts: string[]

  // ── 현재 코드의 접두사(불일치 존재, 참고/문서용). 센터별로 정렬돼 있지 않음. ──
  /** CSS 변수 접두사. 예: '--w-' */
  cssVar: string
  /** CSS 클래스 접두사. 예: 'whif-' */
  cssClass: string
  /** localStorage/sessionStorage 키 접두사. 예: 'whif' */
  storagePrefix: string
}

/** collections API 쿼리 파라미터명. 예: 'whif' → 'isWhif' */
export function centerApiParam(key: string): string {
  return `is${key.charAt(0).toUpperCase()}${key.slice(1)}`
}

// 표시 순서 = 탐색 페이지 순서.
export const CENTERS: CenterDef[] = [
  {
    key: 'whif', label: 'WHIF', domain: 'whif.io', path: '/whif', emoji: '🪐',
    grad: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    desc: '세계관 단위로 캐릭터를 탐색하고 가져오기',
    dbHosts: ['whif.'], importHosts: ['whif.io', 'whif.club'],
    cssVar: '--w-', cssClass: 'whif-', storagePrefix: 'whif',
  },
  {
    key: 'zeta', label: 'ZETA', domain: 'zeta-ai.io', path: '/zeta', emoji: '⚡',
    grad: 'linear-gradient(135deg, #7c5cff, #9d6bff)',
    desc: '플롯 중심의 인터랙티브 스토리 가져오기',
    dbHosts: ['zeta-ai.io'], importHosts: ['zeta-ai.io'],
    cssVar: '--z-', cssClass: 'zeta-', storagePrefix: 'zeta',
  },
  {
    key: 'melting', label: 'MELTING', domain: 'melting.chat', path: '/melting', emoji: '🔥',
    grad: 'linear-gradient(135deg, #ff2e93, #ff5fae)',
    desc: '캐릭터 중심의 몰입형 대화 가져오기',
    dbHosts: ['melting.chat'], importHosts: ['melting.chat'],
    cssVar: '--m-', cssClass: 'melting-', storagePrefix: 'melting',
  },
  {
    key: 'tikita', label: 'TIKITA', domain: 'tikita.ai', path: '/tikita', emoji: '🎫',
    grad: 'linear-gradient(135deg, #16b8a6, #27d3bf)',
    desc: '스토리 URL로 캐릭터·첫 장면 가져오기',
    dbHosts: ['tikita.ai'], importHosts: ['tikita.ai'],
    cssVar: '--t-', cssClass: 'tikita-', storagePrefix: 'tikita',
  },
  {
    key: 'chub', label: 'CHUB', domain: 'chub.ai', path: '/chub', emoji: '🧩',
    grad: 'linear-gradient(135deg, #ff6a3d, #ff9a5a)',
    desc: '외국 캐릭터 URL을 AI 번역으로 가져오기',
    dbHosts: ['chub.ai'], importHosts: ['chub.ai', 'characterhub.org'],
    cssVar: '--c-', cssClass: 'chub-', storagePrefix: 'chub',
  },
  {
    key: 'rofan', label: 'rofanai', domain: 'rofan.ai', path: '/rofan', emoji: '💗',
    grad: 'linear-gradient(135deg, #e0529c, #f07ab8)',
    desc: '로맨스 판타지 캐릭터 URL로 가져오기',
    dbHosts: ['rofan.ai'], importHosts: ['rofan.ai'],
    cssVar: '--r-', cssClass: 'rofan-', storagePrefix: 'rofan',
  },
  {
    key: 'loveydovey', label: 'loveydovey', domain: 'loveydovey.ai', path: '/loveydovey', emoji: '💞',
    grad: 'linear-gradient(135deg, #ff5a5f, #ff8a8d)',
    desc: '캐릭터 메타데이터 가져오기',
    dbHosts: ['loveydovey.ai'], importHosts: ['loveydovey.ai'],
    cssVar: '--l-', cssClass: 'lovey-', storagePrefix: 'lovey',
  },
  {
    key: 'babechat', label: 'babechat', domain: 'babechat.ai', path: '/babechat', emoji: '🩵',
    grad: 'linear-gradient(135deg, #5b8cff, #8a6cff)',
    desc: '캐릭터 설정·도입부 가져오기',
    dbHosts: ['babechat.'], importHosts: ['babechat.ai', 'babechat.jp'],
    cssVar: '--b-', cssClass: 'bc-', storagePrefix: 'bc',
  },
  {
    key: 'tingle', label: 'tingle', domain: 'tingle.chat', path: '/tingle', emoji: '💫',
    grad: 'linear-gradient(135deg, #ff5776, #ff8099)',
    desc: '캐릭터·서사·테마 가져오기',
    dbHosts: ['tingle.chat'], importHosts: ['tingle.chat'],
    cssVar: '--tg-', cssClass: 'tingle-', storagePrefix: 'tg',
  },
  {
    key: 'crack', label: '크랙', domain: 'crack.wrtn.ai', path: '/crack', emoji: '🩶',
    grad: 'linear-gradient(135deg, #3a3a3f, #6b6b73)',
    desc: '뤼튼 크랙 스토리·캐릭터 가져오기',
    dbHosts: ['crack.wrtn.ai'], importHosts: ['crack.wrtn.ai'],
    cssVar: '--crack-', cssClass: 'crack-', storagePrefix: 'crack',
  },
]

/** collections API에서 "외부 센터 전체"를 가리키는 sourceUrl 부분 문자열 목록. */
export const EXTERNAL_HOSTS: string[] = CENTERS.flatMap(c => c.dbHosts)

/** 라우트 경로 → 센터 정의. (Dock active 판정 등) */
export const CENTER_PATHS: string[] = CENTERS.map(c => c.path)

export function centerByApiParam(searchParams: URLSearchParams): CenterDef | undefined {
  return CENTERS.find(c => searchParams.get(centerApiParam(c.key)) === 'true')
}
