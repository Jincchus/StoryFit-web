export type PersonaCandidate = { id: string; name: string; gender: string; avatarUrl: string | null }

export function buildPersonaCandidates(args: {
  collectionChars: PersonaCandidate[]
  standaloneCards: PersonaCandidate[]
  aiCharIds: string[]
}): PersonaCandidate[] {
  const exclude = new Set(args.aiCharIds)
  const seen = new Set<string>()
  const out: PersonaCandidate[] = []
  for (const cand of [...args.collectionChars, ...args.standaloneCards]) {
    if (exclude.has(cand.id) || seen.has(cand.id)) continue
    seen.add(cand.id)
    out.push(cand)
  }
  return out
}
