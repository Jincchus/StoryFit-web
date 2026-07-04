import { describe, it, expect } from 'vitest'
import { extractRofanSecret } from './rofanSecretPaste'

const USER_SPAN = '<span style="color:#FFC200; font-weight:500; font-style:italic;  padding-right:2px;">허니</span>'

describe('extractRofanSecret', () => {
  it('CreateChat payload({botDetail:{char_secrets}})에서 추출한다', () => {
    const payload = { userData: {}, botDetail: { char: '태묵', char_secrets: `비밀<br />${USER_SPAN}에게만` }, botTags: [] }
    const r = extractRofanSecret(JSON.stringify(payload))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('비밀\n{{user}}에게만')
  })

  it('botDetail 단독({char_secrets})에서 추출한다', () => {
    const r = extractRofanSecret(JSON.stringify({ char_secrets: '숨김 규칙' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('숨김 규칙')
  })

  it('__NEXT_DATA__ 통째(props.pageProps.oriBotDetail)에서 추출한다', () => {
    const nextData = { props: { pageProps: { oriBotDetail: { char_secrets: '오리 비설' } } } }
    const r = extractRofanSecret(JSON.stringify(nextData))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('오리 비설')
  })

  it('JSON이 아닌 원문 텍스트도 정리해서 받는다', () => {
    const r = extractRofanSecret(`규칙 1<br />규칙 2 ${USER_SPAN}`)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('규칙 1\n규칙 2 {{user}}')
  })

  it('char_secrets 없는 JSON은 no_secret', () => {
    const r = extractRofanSecret(JSON.stringify({ botDetail: { char: '태묵', char_persona: '설정' } }))
    expect(r).toEqual({ ok: false, reason: 'no_secret' })
  })

  it('char_secrets가 빈 문자열이면 no_secret(빈 값은 무시)', () => {
    const r = extractRofanSecret(JSON.stringify({ botDetail: { char_secrets: '   ' } }))
    expect(r).toEqual({ ok: false, reason: 'no_secret' })
  })

  it('깨진 JSON({로 시작)은 bad_json', () => {
    const r = extractRofanSecret('{ "botDetail": { "char_secrets": ')
    expect(r).toEqual({ ok: false, reason: 'bad_json' })
  })

  it('빈 입력은 empty', () => {
    expect(extractRofanSecret('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('HTML 엔티티를 디코드한다', () => {
    const r = extractRofanSecret(JSON.stringify({ char_secrets: 'A &amp; B &lt;br&gt;' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('A & B <br>')
  })

  it('중첩 깊은 곳의 char_secrets도 찾는다(포맷 변형 대비)', () => {
    const weird = { data: { result: { bot: { char_secrets: '깊은 비설' } } } }
    const r = extractRofanSecret(JSON.stringify(weird))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('깊은 비설')
  })
})

describe('extractRofanSecret — 저장 시 자동추출(편집창에 JSON 통째 붙여넣기 대비)', () => {
  it('CreateChat payload 통째를 넣어도 char_secrets만 정리해 돌려준다', () => {
    const payload = { userData: { id: 'x' }, botDetail: { char: '태묵', char_persona: 'p', char_secrets: '숨김<br />규칙' }, botTags: [] }
    const r = extractRofanSecret(JSON.stringify(payload))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('숨김\n규칙')
  })
})
