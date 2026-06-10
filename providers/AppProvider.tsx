'use client'
import { createContext, useContext, useReducer, type ReactNode } from 'react'
import type { AIProvider } from '@/types'

interface Draft {
  charId: string | null
  personaId: string | null
  modelId: AIProvider
}

type Action =
  | { type: 'selectChar'; id: string }
  | { type: 'selectPersona'; id: string | null }
  | { type: 'selectModel'; id: AIProvider }
  | { type: 'resetDraft' }

function reducer(draft: Draft, action: Action): Draft {
  switch (action.type) {
    case 'selectChar':    return { ...draft, charId: action.id }
    case 'selectPersona': return { ...draft, personaId: action.id }
    case 'selectModel':   return { ...draft, modelId: action.id }
    case 'resetDraft':    return { charId: null, personaId: null, modelId: 'claude' }
    default: return draft
  }
}

const AppContext = createContext<{ draft: Draft; dispatch: React.Dispatch<Action> } | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [draft, dispatch] = useReducer(reducer, { charId: null, personaId: null, modelId: 'claude' })
  return <AppContext.Provider value={{ draft, dispatch }}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
