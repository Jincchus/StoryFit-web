import { describe, it, expect } from 'vitest'
import { fixJosa, applyPersonaPlaceholders, replaceDisplayPlaceholders } from './josa'

describe('fixJosa', () => {
  it('받침 있는 이름 뒤 잘못된 은/는을 은으로 교정한다', () => {
    expect(fixJosa('민준는 학교에 갔다', ['민준'])).toBe('민준은 학교에 갔다')
  })

  it('받침 없는 이름 뒤 잘못된 은/는을 는으로 교정한다', () => {
    expect(fixJosa('철수은 학교에 갔다', ['철수'])).toBe('철수는 학교에 갔다')
  })

  it('받침 있는 이름 뒤 이/가를 이로 교정한다', () => {
    expect(fixJosa('민준가 왔다', ['민준'])).toBe('민준이 왔다')
  })

  it('받침 없는 이름 뒤 이/가를 가로 교정한다', () => {
    expect(fixJosa('철수이 왔다', ['철수'])).toBe('철수가 왔다')
  })

  it('받침 있는 이름 뒤 을/를을 을로 교정한다', () => {
    expect(fixJosa('민준를 불렀다', ['민준'])).toBe('민준을 불렀다')
  })

  it('받침 없는 이름 뒤 을/를을 를로 교정한다', () => {
    expect(fixJosa('철수을 불렀다', ['철수'])).toBe('철수를 불렀다')
  })

  it('받침 있는 이름 뒤 와/과를 과로 교정한다', () => {
    expect(fixJosa('민준와 함께', ['민준'])).toBe('민준과 함께')
  })

  it('받침 없는 이름 뒤 와/과를 와로 교정한다', () => {
    expect(fixJosa('철수과 함께', ['철수'])).toBe('철수와 함께')
  })

  it('받침 없는 이름 뒤 으로/로를 로로 교정한다', () => {
    expect(fixJosa('철수으로 갔다', ['철수'])).toBe('철수로 갔다')
  })

  it('ㄹ받침 이름 뒤 으로/로를 로로 교정한다', () => {
    expect(fixJosa('민철으로 갔다', ['민철'])).toBe('민철로 갔다')
  })

  it('ㄹ이 아닌 받침 이름 뒤 로/으로를 으로로 교정한다', () => {
    expect(fixJosa('민준로 갔다', ['민준'])).toBe('민준으로 갔다')
  })

  it('받침 없는 이름 뒤 (이)라를 라로 교정하며 처리 순서를 보장한다', () => {
    expect(fixJosa('철수이라면 좋겠다', ['철수'])).toBe('철수라면 좋겠다')
  })

  it('받침 있는 이름 뒤 (이)라를 이라로 교정한다', () => {
    expect(fixJosa('민준라면 좋겠다', ['민준'])).toBe('민준이라면 좋겠다')
  })

  it('받침 없는 이름 뒤 (이)나를 나로 교정한다', () => {
    expect(fixJosa('철수이나 갈까', ['철수'])).toBe('철수나 갈까')
  })

  it('받침 있는 이름 뒤 (이)며를 이며로 교정한다', () => {
    expect(fixJosa('민준며 인사했다', ['민준'])).toBe('민준이며 인사했다')
  })

  it('이미 올바른 조사는 그대로 유지한다(멱등)', () => {
    expect(fixJosa('민준은 학교에 갔다', ['민준'])).toBe('민준은 학교에 갔다')
    expect(fixJosa('철수는 학교에 갔다', ['철수'])).toBe('철수는 학교에 갔다')
  })

  it('한글 음절이 아닌 문자로 끝나는 이름은 받침 없음으로 처리한다', () => {
    expect(fixJosa('Tom은 왔다', ['Tom'])).toBe('Tom는 왔다')
  })

  it('null/undefined 이름은 무시한다', () => {
    expect(fixJosa('민준는 학교에 갔다', ['민준', null, undefined])).toBe('민준은 학교에 갔다')
  })

  it('여러 이름을 동시에 교정한다', () => {
    expect(fixJosa('민준는 철수과 만났다', ['민준', '철수'])).toBe('민준은 철수와 만났다')
  })
})

describe('replaceDisplayPlaceholders', () => {
  it('{{user}}와 {{char}}를 치환하고 조사를 교정한다', () => {
    expect(replaceDisplayPlaceholders('{{user}}는 {{char}}이 좋다', '민준', '철수')).toBe('민준은 철수가 좋다')
  })

  it('charName이 없으면 {{char}}는 치환하지 않는다', () => {
    expect(replaceDisplayPlaceholders('{{user}}는 인사했다', '민준')).toBe('민준은 인사했다')
  })
})

describe('applyPersonaPlaceholders', () => {
  it('{{user}}/{{char}}/{user}/{char}/{유저}/{캐릭터}/[유저]/[USER]를 치환한다', () => {
    expect(applyPersonaPlaceholders('{{user}}와 {{char}}', '민준', '철수')).toBe('민준와 철수')
    expect(applyPersonaPlaceholders('{user}와 {char}', '민준', '철수')).toBe('민준와 철수')
    expect(applyPersonaPlaceholders('{유저}와 {캐릭터}', '민준', '철수')).toBe('민준와 철수')
    expect(applyPersonaPlaceholders('[유저]와 [USER]', '민준')).toBe('민준와 민준')
  })

  it('Guest/User를 대소문자 무관하게 치환한다', () => {
    expect(applyPersonaPlaceholders('Guest와 User와 GUEST와 guest', '민준')).toBe('민준와 민준와 민준와 민준')
  })

  it('persona/페르소나를 치환한다 (주인공/당신은 일반 단어라 치환하지 않음)', () => {
    expect(applyPersonaPlaceholders('persona와 페르소나', '민준')).toBe('민준와 민준')
    expect(applyPersonaPlaceholders('주인공과 당신', '민준')).toBe('주인공과 당신')
  })

  it('charName이 없으면 {{char}} 패턴은 치환하지 않는다', () => {
    expect(applyPersonaPlaceholders('{{user}}와 {{char}}', '민준')).toBe('민준와 {{char}}')
  })
})

describe('replaceDisplayPlaceholders - 확장 패턴', () => {
  it('Guest/User 표기를 페르소나 이름으로 치환하고 조사를 교정한다', () => {
    expect(replaceDisplayPlaceholders('Guest는 학교에 갔다', '민준')).toBe('민준은 학교에 갔다')
    expect(replaceDisplayPlaceholders('User는 학교에 갔다', '민준')).toBe('민준은 학교에 갔다')
  })

  it('페르소나 표기를 페르소나 이름으로 치환하고 조사를 교정한다 (당신은 미치환)', () => {
    expect(replaceDisplayPlaceholders('페르소나가 왔다', '철수')).toBe('철수가 왔다')
    expect(replaceDisplayPlaceholders('당신은 누구인가', '철수')).toBe('당신은 누구인가')
  })
})
