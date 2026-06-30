// 채팅 커맨드(!xxx)의 순수 파싱/분류/지시합성. UI/DB 무관.

export interface ParsedCommand { name: string; args: string }

export function parseCommand(text: string): ParsedCommand | null {
  const t = text.trim()
  if (!t.startsWith('!')) return null
  const rest = t.slice(1)
  const m = rest.match(/^(\S+)\s*([\s\S]*)$/)
  if (!m) return null
  return { name: m[1], args: m[2].trim() }
}

// 빌트인 예약어(소문자). 채팅 라우트의 결정적 커맨드 + 폴백 대상.
const BUILTIN_NAMES = new Set([
  '상태창', '정보', 'status',
  '스탯', '능력치', 'stats', '호감도', '관계',
  '인벤토리', '소지품', '인벤', 'inventory',
  '상황', '씬', 'scene', '타임라인',
  '도움말', '명령어', 'help',
])

export function isBuiltinCommand(name: string): boolean {
  return BUILTIN_NAMES.has(name.toLowerCase())
}

export function builtinFallbackKey(name: string): 'status' | 'stats' | 'inventory' | 'scene' | null {
  const n = name.toLowerCase()
  if (['상태창', '정보', 'status'].includes(n)) return 'status'
  if (['스탯', '능력치', 'stats', '호감도', '관계'].includes(n)) return 'stats'
  if (['인벤토리', '소지품', '인벤', 'inventory'].includes(n)) return 'inventory'
  if (['상황', '씬', 'scene', '타임라인'].includes(n)) return 'scene'
  return null // 도움말 등 폴백 없음
}

export const BUILTIN_FALLBACK: Record<'status' | 'stats' | 'inventory' | 'scene', string> = {
  status: '현재 상황(직전 대화·타임라인·기존 스탯/인벤토리)을 근거로 캐릭터의 스탯·호감도·소지품·현재 상황을 합리적으로 추론해, 마크다운 형식의 상태창으로 작성하라.',
  stats: '현재 상황을 근거로 캐릭터의 능력치와 관계(호감도) 스탯을 합리적으로 추론해, 마크다운 형식으로 작성하라.',
  inventory: '현재 상황을 근거로 보유 중일 법한 소지품(인벤토리)을 합리적으로 추론해, 마크다운 목록으로 작성하라.',
  scene: '현재 상황(시간대·장소·복장·분위기 등)을 마크다운 형식의 상황 요약으로 작성하라.',
}

// 커맨드 응답이 진행 중인 롤플레이를 이어가지 않고 "결과만" 나오도록 강제하는 공통 머리말.
export const COMMAND_ISOLATION_PREAMBLE =
  '사용자가 시스템 조회 커맨드를 실행했다. 진행 중인 롤플레이/스토리를 이어가지 마라. ' +
  '장면 묘사·캐릭터 대사·소설체 서술·다음 전개를 출력하지 말고, 아래 지시의 결과만 마크다운으로 출력하라. ' +
  '인사말·서두·맺음말·잡담 금지.'

export function composeCommandDirective(name: string, instruction: string, args: string): string {
  const extra = args ? `\n추가 지시: ${args}` : ''
  return `[시스템 커맨드: ${name}]\n${COMMAND_ISOLATION_PREAMBLE}\n\n지시: ${instruction}${extra}`
}

// 커맨드 이름 검증. null=유효, 문자열=에러 사유.
export function validateCommandName(name: string): string | null {
  const n = (name ?? '').trim()
  if (!n) return '이름을 입력하세요.'
  if (/\s/.test(n) || n.includes('!')) return '이름에는 공백이나 ! 를 넣을 수 없습니다.'
  if (n.length > 20) return '이름은 20자 이내여야 합니다.'
  if (!/^[가-힣a-zA-Z0-9_]+$/.test(n)) return '이름은 한글·영문·숫자·_ 만 가능합니다.'
  if (isBuiltinCommand(n)) return '기본 명령어와 같은 이름은 쓸 수 없습니다.'
  return null
}
