export interface ChapterMsg { id: string; chapter?: number }
export interface ChapterAnchor { chapter: number; firstMessageId: string }

type PlotLike = { chapters: { index: number; title: string }[] } | null | undefined

/** 챕터 번호 → 표시 라벨. plotOutline에 해당 index 제목이 있으면 「제목」을 붙인다. */
export function chapterLabel(chapter: number, plotOutline?: PlotLike): string {
  const title = plotOutline?.chapters.find(c => c.index === chapter)?.title?.trim()
  return title ? `${chapter}화 「${title}」` : `${chapter}화`
}

/** 시간순 메시지에서 "직전 메시지와 챕터가 달라지는" 경계 메시지 id → 챕터 매핑.
 *  맨 첫 메시지는 경계로 보지 않는다(스토리 시작점). */
export function deriveChapterBoundaries(messages: ChapterMsg[]): Map<string, number> {
  const out = new Map<string, number>()
  let prev: number | undefined
  for (const m of messages) {
    const ch = m.chapter ?? 1
    if (prev !== undefined && ch !== prev) out.set(m.id, ch)
    prev = ch
  }
  return out
}

/** 전체 메시지에서 각 챕터의 첫 메시지 id를 챕터 오름차순으로 수집(점프 네비용). */
export function buildChapterMeta(messages: ChapterMsg[]): ChapterAnchor[] {
  const seen = new Set<number>()
  const out: ChapterAnchor[] = []
  for (const m of messages) {
    const ch = m.chapter ?? 1
    if (!seen.has(ch)) { seen.add(ch); out.push({ chapter: ch, firstMessageId: m.id }) }
  }
  return out.sort((a, b) => a.chapter - b.chapter)
}
