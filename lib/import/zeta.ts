import type { Captured, AssembledCharacter } from './types'

export function normalizeGuest(text: string): string {
  return text.split('Guest').join('{{user}}')
}

function buildZetaOpenings(intros: any): { id: string; title: string; content: string }[] {
  if (!Array.isArray(intros)) return []
  return intros
    .map((intro, idx) => {
      const messages = intro?.conversation?.messages ?? []
      const content = (Array.isArray(messages) ? messages : [])
        .map((m: any) => String(m?.content ?? ''))
        .filter(Boolean)
        .join('\n\n')
      return {
        id: `intro_${idx}`,
        title: idx === 0 ? '기본 도입부' : `도입부 ${idx + 1}`,
        content: normalizeGuest(content),
      }
    })
    .filter(o => o.content.trim().length > 0)
}

export function buildZetaCaptured(plot: any, canonicalUrl: string): Captured {
  const rawChars = Array.isArray(plot.characters) ? plot.characters : []
  const hashtags = Array.isArray(plot.hashtags) ? plot.hashtags : []
  const openings = buildZetaOpenings(plot.intros)
  const safetyLevel = plot.unlimitedAllowed ? 'relaxed' : 'standard'

  const characters: AssembledCharacter[] = rawChars.map((c: any, i: number) => ({
    name: c.name || plot.name || '캐릭터',
    gender: '',
    tags: hashtags,
    additionalInfo: normalizeGuest(String(c.description ?? '')),
    openingMessage: i === 0 ? (openings[0]?.content ?? '') : '',
    openingMessages: i === 0 && openings.length > 1 ? openings : undefined,
    exampleDialogues: '',
    avatarUrl: c.imageUrl || '',
  }))

  if (characters.length === 0) {
    characters.push({
      name: plot.name || '캐릭터',
      gender: '',
      tags: hashtags,
      additionalInfo: normalizeGuest(String(plot.longDescription ?? '')),
      openingMessage: openings[0]?.content ?? '',
      openingMessages: openings.length > 1 ? openings : undefined,
      exampleDialogues: '',
      avatarUrl: plot.imageUrl || '',
    })
  }

  return {
    sections: [],
    title: '',
    imageUrl: plot.imageUrl || rawChars[0]?.imageUrl || '',
    universeUrl: canonicalUrl,
    assembledResult: {
      characters,
      scenarioDescription: normalizeGuest(String(plot.longDescription ?? '')),
      tags: hashtags,
      title: plot.name || '캐릭터',
      safetyLevel,
      coverImageUrl: plot.imageUrl || '',
    },
    zetaMeta: plot,
  }
}
