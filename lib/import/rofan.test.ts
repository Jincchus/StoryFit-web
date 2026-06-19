import { describe, it, expect } from 'vitest'
import { parseRofanUrl, extractNextData, assembleRofan } from './rofan'

describe('parseRofanUrl', () => {
  it('character UUID 추출', () => {
    expect(parseRofanUrl('https://rofan.ai/character/2bd7ab85-4990-4880-a29f-2ec2feb0f637'))
      .toBe('2bd7ab85-4990-4880-a29f-2ec2feb0f637')
  })
  it('쿼리·해시 붙어도 추출', () => {
    expect(parseRofanUrl('https://rofan.ai/character/2bd7ab85-4990-4880-a29f-2ec2feb0f637?x=1#y'))
      .toBe('2bd7ab85-4990-4880-a29f-2ec2feb0f637')
  })
  it('형식이 아니면 throw', () => {
    expect(() => parseRofanUrl('https://rofan.ai/')).toThrow()
  })
})

describe('extractNextData', () => {
  it('__NEXT_DATA__에서 pageProps 추출', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { oriBotDetail: { char: '하람' } } } })}</script></html>`
    expect(extractNextData(html)).toEqual({ oriBotDetail: { char: '하람' } })
  })
  it('스크립트 없으면 throw', () => {
    expect(() => extractNextData('<html></html>')).toThrow()
  })
})

describe('assembleRofan', () => {
  const pageProps = {
    oriBotDetail: {
      char: '윤하람',
      gender: 'male',
      char_persona: '187cm 남성.',
      worldview: '로판 세계관 설정.',
      first_message: '*더 많이 사랑하는 쪽이 지는거라고 했던가.*',
      creator_message: '순애남 하람이가 왔습니다.',
      summary: '좋아해요. 그러니까 사귀어줄때도 되지 않았어요?',
      char_image: 'https://img.rofan.ai/bot-assets/x/y.png',
      nsfw: false,
    },
    botTags: [{ tag_name: '짝사랑' }, { tag_name: '순애' }, { tag_name: '' }],
  }

  it('필드를 매핑한다', () => {
    const r = assembleRofan(pageProps)
    const c = r.characters[0]
    expect(c.name).toBe('윤하람')
    expect(c.gender).toBe('남성')
    expect(c.openingMessage).toContain('지는거라고')
    expect(c.tags).toEqual(['짝사랑', '순애'])
    expect(c.exampleDialogues).toBe('')
  })

  it('worldview·creator_message를 라벨과 함께 additionalInfo에 합친다', () => {
    const c = assembleRofan(pageProps).characters[0]
    expect(c.additionalInfo).toContain('187cm 남성.')
    expect(c.additionalInfo).toContain('[세계관]\n로판 세계관 설정.')
    expect(c.additionalInfo).toContain('[제작자 메모]\n순애남 하람이가 왔습니다.')
  })

  it('summary는 scenarioDescription, nsfw는 safetyLevel로', () => {
    const r = assembleRofan(pageProps)
    expect(r.scenarioDescription).toContain('좋아해요')
    expect(r.safetyLevel).toBe('standard')
    expect(assembleRofan({ ...pageProps, oriBotDetail: { ...pageProps.oriBotDetail, nsfw: true } }).safetyLevel).toBe('relaxed')
  })

  it('이름 없으면 throw', () => {
    expect(() => assembleRofan({ oriBotDetail: {} })).toThrow()
  })
})
