import { describe, it, expect } from 'vitest'
import { mergeCookieString } from './cookieMerge'

describe('mergeCookieString', () => {
  it('갱신된 쿠키 값으로 덮어쓰되 나머지는 보존한다', () => {
    const existing = 'a=1; b=2; __Host-melting_session=old'
    const refreshed = ['__Host-melting_session=new']
    expect(mergeCookieString(existing, refreshed)).toBe('a=1; b=2; __Host-melting_session=new')
  })

  it('기존에 없던 쿠키면 새로 추가한다', () => {
    const existing = 'a=1'
    const refreshed = ['__Host-melting_session=new', '__Host-melting_session_exp=123']
    expect(mergeCookieString(existing, refreshed)).toBe('a=1; __Host-melting_session=new; __Host-melting_session_exp=123')
  })

  it('갱신분이 비어있으면 기존 그대로', () => {
    expect(mergeCookieString('a=1; b=2', [])).toBe('a=1; b=2')
  })

  it('기존이 빈 문자열이면 갱신분만 남는다', () => {
    expect(mergeCookieString('', ['x=y'])).toBe('x=y')
  })
})
