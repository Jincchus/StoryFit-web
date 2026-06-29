import { api } from '@/lib/api'
import type { NewPersonaData } from '@/components/ui/WhifPersonaModal'
export type { NewPersonaData }

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

const DEFAULT_CHAT_OPTIONS = {
  statsEnabled: true,
  statsConfig: [{ name: '호감도', value: 50, min: 0, max: 100 }],
  suggestRepliesEnabled: true,
}

export async function createCenterChat(args: {
  collectionId: string
  title: string
  aiCharIds: string[]
  personaCharId: string | null
  newPersona?: NewPersonaData
  flipPlaceholders: boolean
  opening?: string
  extras?: Record<string, unknown>
}): Promise<{ id: string }> {
  let personaId = args.personaCharId
  if (!personaId && args.newPersona) {
    const p = await api.post('/api/characters', {
      name: args.newPersona.name,
      gender: args.newPersona.gender,
      additionalInfo: args.newPersona.additionalInfo,
    })
    personaId = p.id
  }
  return api.post('/api/conversations', {
    title: args.title,
    characterIds: args.aiCharIds,
    mode: args.aiCharIds.length > 1 ? 'multiStory' : 'story',
    personaCharacterId: personaId,
    personaFlipPlaceholders: args.flipPlaceholders,
    ...DEFAULT_CHAT_OPTIONS,
    ...(args.opening?.trim() ? { openingMessage: args.opening } : {}),
    ...(args.extras ?? {}),
  })
}
