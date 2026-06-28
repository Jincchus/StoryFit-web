import { describe, it, expect } from 'vitest'
import { parseCommand, isBuiltinCommand, builtinFallbackKey, composeCommandDirective, validateCommandName } from './commands'

describe('parseCommand', () => {
  it('이름과 인자를 분리한다', () => {
    expect(parseCommand('!에타 오늘 사건 위주로')).toEqual({ name: '에타', args: '오늘 사건 위주로' })
  })
  it('인자 없으면 args는 빈 문자열', () => {
    expect(parseCommand('  !상태창  ')).toEqual({ name: '상태창', args: '' })
  })
  it('! 로 시작하지 않으면 null', () => {
    expect(parseCommand('안녕')).toBeNull()
  })
})

describe('isBuiltinCommand', () => {
  it('예약어는 true(대소문자 무관)', () => {
    expect(isBuiltinCommand('상태창')).toBe(true)
    expect(isBuiltinCommand('STATUS')).toBe(true)
    expect(isBuiltinCommand('도움말')).toBe(true)
  })
  it('그 외는 false', () => {
    expect(isBuiltinCommand('에타')).toBe(false)
  })
})

describe('builtinFallbackKey', () => {
  it('상태계 별칭을 키로 매핑, 도움말은 null', () => {
    expect(builtinFallbackKey('정보')).toBe('status')
    expect(builtinFallbackKey('호감도')).toBe('stats')
    expect(builtinFallbackKey('소지품')).toBe('inventory')
    expect(builtinFallbackKey('타임라인')).toBe('scene')
    expect(builtinFallbackKey('도움말')).toBeNull()
    expect(builtinFallbackKey('에타')).toBeNull()
  })
})

describe('composeCommandDirective', () => {
  it('지시문+인자+마크다운 지시를 합성', () => {
    const d = composeCommandDirective('에타', '게시글 작성', '오늘 위주')
    expect(d).toContain('[사용자 커맨드: 에타]')
    expect(d).toContain('게시글 작성')
    expect(d).toContain('추가 지시: 오늘 위주')
    expect(d).toContain('마크다운')
  })
  it('인자 없으면 추가 지시 줄 없음', () => {
    expect(composeCommandDirective('에타', '게시글 작성', '')).not.toContain('추가 지시:')
  })
})

describe('validateCommandName', () => {
  it('빌트인/중복 예약어는 에러', () => {
    expect(validateCommandName('상태창')).not.toBeNull()
  })
  it('빈 값·공백·! 포함은 에러', () => {
    expect(validateCommandName('')).not.toBeNull()
    expect(validateCommandName('에 타')).not.toBeNull()
    expect(validateCommandName('!에타')).not.toBeNull()
  })
  it('정상 이름은 null', () => {
    expect(validateCommandName('에타')).toBeNull()
  })
})
