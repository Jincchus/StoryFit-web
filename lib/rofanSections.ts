// rofan 캐릭터의 additionalInfo를 표시용 섹션으로 분리한다(순수 함수).
//
// 임포터(lib/import/rofan.ts assembleRofan)는 char_persona·worldview·userPersona·creator_message를
// 하나의 additionalInfo에 아래 마커로 이어 붙인다:
//   <char_persona>\n\n[세계관]\n<worldview>\n\n[유저 역할]\n<userPersona>\n\n[제작자 메모]\n<creator_message>
// 화면에선 rofan.ai처럼 캐릭터 소개 / 세계관 / 유저 역할 / 제작자 코멘트로 나눠 보여준다.
// 프롬프트/저장 데이터는 그대로 두고 "표시"만 쪼갠다.

export interface RofanSection {
  title: string
  body: string
}

// 마커(줄 시작) → 표시 제목. 순서는 임포터가 붙이는 순서와 무관하게 등장 순서대로 처리한다.
const MARKERS: { marker: string; title: string }[] = [
  { marker: '[세계관]', title: '세계관' },
  { marker: '[유저 역할]', title: '유저 역할' },
  { marker: '[제작자 메모]', title: '제작자 코멘트' },
]

export function splitRofanSections(additionalInfo: string, introTitle = '캐릭터 소개'): RofanSection[] {
  const text = (additionalInfo ?? '').trim()
  if (!text) return []

  // 각 마커의 등장 위치를 찾는다(줄 시작에 있는 것만 인정).
  const hits: { index: number; marker: string; title: string }[] = []
  for (const { marker, title } of MARKERS) {
    const re = new RegExp(`(^|\\n)${escapeRegExp(marker)}\\n?`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      // 마커 자체가 시작하는 위치(선행 개행 제외)
      hits.push({ index: m.index + m[1].length, marker, title })
    }
  }
  hits.sort((a, b) => a.index - b.index)

  // 마커가 하나도 없으면 통째로 "상세 설정" 취지로 단일 섹션 반환(호출부가 제목 지정).
  if (hits.length === 0) return [{ title: introTitle, body: text }]

  const sections: RofanSection[] = []
  // 첫 마커 앞부분 = 캐릭터 소개
  const intro = text.slice(0, hits[0].index).trim()
  if (intro) sections.push({ title: introTitle, body: intro })

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]
    const bodyStart = h.index + h.marker.length
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length
    const body = text.slice(bodyStart, end).trim()
    if (body) sections.push({ title: h.title, body })
  }
  return sections
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
