import { describe, it, expect } from 'vitest'
import { mapCrackLikedStory } from './crack'

const LIKED_STORY = {
  _id: '68d7c7f3d363ae78c0d1d2ec',
  name: '너만 사랑해',
  tags: ['HL', 'BL', '오지콤', '순애'],
  isAdult: true,
  portraitImage: null,
  profileImage: {
    origin: 'https://cdn/f7658373_origin.webp',
    w600: 'https://cdn/f7658373_w600.webp',
  },
}

describe('mapCrackLikedStory', () => {
  it('maps id/name/tags/isAdult/sourceUrl', () => {
    const it0 = mapCrackLikedStory(LIKED_STORY)
    expect(it0.id).toBe('68d7c7f3d363ae78c0d1d2ec')
    expect(it0.name).toBe('너만 사랑해')
    expect(it0.tags).toEqual(['HL', 'BL', '오지콤', '순애'])
    expect(it0.isAdult).toBe(true)
    expect(it0.sourceUrl).toBe('https://crack.wrtn.ai/detail/68d7c7f3d363ae78c0d1d2ec')
  })
  it('falls back to profileImage.w600 when portraitImage is null', () => {
    expect(mapCrackLikedStory(LIKED_STORY).coverImageUrl).toBe('https://cdn/f7658373_w600.webp')
  })
  it('prefers portraitImage.w600 when present', () => {
    const s = { ...LIKED_STORY, portraitImage: { w600: 'https://cdn/portrait_w600.webp' } }
    expect(mapCrackLikedStory(s).coverImageUrl).toBe('https://cdn/portrait_w600.webp')
  })
  it('handles missing tags → []', () => {
    expect(mapCrackLikedStory({ _id: 'x', name: 'n' }).tags).toEqual([])
  })
})
