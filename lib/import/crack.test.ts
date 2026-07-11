import { describe, it, expect } from 'vitest'
import { assembleCrackStory } from './crack'

// 실측 데이터 트리밍 사본 — GET /crack-api/stories/{id} → .data
// 스토리: "걘 여자로 안보여" (id 68bed577b1eb4e130027a0dd)
const story = {
  _id: '68bed577b1eb4e130027a0dd',
  name: '걘 여자로 안보여',
  description: "'걘 여자로 안보여.' 그가 친구들에게 무심하게 말했다.\n\n과방에 강주하를 찾으러갔다가 그가 친구들과 한 대화를 우연히 엿들었다.\n근데 뭐지..? 조금... 아니 조금 많이 자존심 상한다...\n남캐플도 가능 / 난이도가 꽤 있어요🤔",
  simpleDescription: '넌 그냥 친구지. 소꿉친구',
  detailDescription: "'걘 여자로 안보여.' 그가 친구들에게 무심하게 말했다.\n\n과방에 강주하를 찾으러갔다가 그가 친구들과 한 대화를 우연히 엿들었다.\n남캐플도 가능 / 난이도가 꽤 있어요🤔",
  tags: ['소꿉친구', '무심', '공략', '철벽남', 'HL', 'BL', '로맨스', '찐친'],
  isAdult: true,
  profileImage: {
    origin: 'https://d394jeh9729epj.cloudfront.net/8Gz9XHRun9S-GGKOWkRZUkYy/81ef91af_origin.webp',
    w600: 'https://d394jeh9729epj.cloudfront.net/8Gz9XHRun9S-GGKOWkRZUkYy/81ef91af_w600.webp',
  },
  portraitImage: {
    origin: 'https://d394jeh9729epj.cloudfront.net/8Gz9XHRun9S-GGKOWkRZUkYy/361341f0_origin.webp',
    w600: 'https://d394jeh9729epj.cloudfront.net/8Gz9XHRun9S-GGKOWkRZUkYy/361341f0_w600.webp',
  },
  representativeComment: {
    content: '📌캐릭터 프로필\n-이름 : 강주하(20세)\n-신체 : 182cm\n-외모 : 검은 머리카락, 갈색 눈동자, 시크/냉철 인상\n-직업 : 한국대학교 전기공학부 1학년\n-성격 : 냉소적/무심 완벽주의자. ISTP\n-특징 : 요리잘함',
  },
  startingSets: [
    {
      _id: '69fb1c957e4759a275abab94',
      name: '걘 여자로 안보여/HL',
      initialMessages: [
        '[0턴｜한국대 과방｜♀️] 🟩\n*늦은 시간 과방. 주하는 무표정하게 폰을 응시하고 있었다.*\n\n**김민혁 |** 야, 강주하, 너 허니랑 진짜 뭔 사이냐?\n\n**강주하 |** 쓸데없는 말 하지 마라. 그냥 친형제나 다름없는 애야.\n\n**강주하 |** 그래, 걔 여자로 안보여.',
      ],
      replySuggestions: ['나도 너 남자로 안보이거든? *툴툴거리며* 집에나 가자'],
      playGuide: '난이도 Up. #명령어 !요약 !에타',
    },
    {
      _id: '69fb1c957e4759a275abab96',
      name: '남자한테 관심없어/BL',
      initialMessages: [
        '[#0｜강주하 자취방｜♂️]🟩\n*늦은 밤, 강주하의 자취방.*\n\n**강주하 |** 왔냐? 도어락 비번 틀리는 소리 엄청 나던데...',
      ],
      playGuide: '난이도 Up.',
    },
  ],
}

// 실측 데이터 트리밍 사본 — GET /crack-api/stories/{id}/associated-characters → .data.characters
const associatedCharacters = [
  {
    _id: '68db58be3757d5016ac6ed5f',
    name: '강주하',
    simpleDescription: '걔?? 그냥 친구지. 그냥 소꿉친구',
    profileImage: {
      origin: 'https://wrtn-image-ai-character.s3.ap-northeast-2.amazonaws.com/8Gz9XHRun9S-GGKOWkRZUkYy/c3ff1f95_origin.webp',
      w600: 'https://wrtn-image-ai-character.s3.ap-northeast-2.amazonaws.com/8Gz9XHRun9S-GGKOWkRZUkYy/c3ff1f95_w600.webp',
    },
  },
]

describe('assembleCrackStory', () => {
  it('title/tags/cover/safety를 매핑한다', () => {
    const { result } = assembleCrackStory(story, associatedCharacters)
    expect(result.title).toBe('걘 여자로 안보여')
    expect(result.tags).toHaveLength(8)
    expect(result.tags).toContain('소꿉친구')
    expect(result.safetyLevel).toBe('relaxed')
    expect(typeof result.coverImageUrl).toBe('string')
    expect(result.coverImageUrl!.length).toBeGreaterThan(0)
  })

  it('associated-characters로 캐릭터/crackIds를 만든다', () => {
    const { result, crackIds } = assembleCrackStory(story, associatedCharacters)
    expect(result.characters.map((c) => c.name)).toEqual(['강주하'])
    expect(crackIds).toEqual(['68db58be3757d5016ac6ed5f'])
    expect(crackIds.length).toBe(result.characters.length)
  })

  it('첫 캐릭터가 startingSets 2개를 openingMessages로 갖는다', () => {
    const { result } = assembleCrackStory(story, associatedCharacters)
    const c = result.characters[0]
    expect(c.openingMessages?.length).toBe(2)
    expect(c.openingMessages?.[0].title).toBe('걘 여자로 안보여/HL')
    expect(c.openingMessage).toBeTruthy()
    expect(c.openingMessage).toContain('과방')
  })

  it('첫 캐릭터 additionalInfo에 representativeComment(제작자 노트)가 포함된다', () => {
    const { result } = assembleCrackStory(story, associatedCharacters)
    expect(result.characters[0].additionalInfo).toContain('강주하')
  })

  it('associatedCharacters가 비면 대표 캐릭터 1명으로 폴백한다', () => {
    const { result, crackIds } = assembleCrackStory(story, [])
    expect(result.characters).toHaveLength(1)
    expect(result.characters[0].openingMessages?.length).toBe(2)
    expect(crackIds).toEqual([''])
  })
})
