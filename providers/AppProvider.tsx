'use client'
import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { PRESET_CHARS, PRESET_PERSONAS } from '@/data/presetCharacters'
import type { Character, Conversation, UserPersona, Message, AIProvider, Draft } from '@/types'

interface AppState {
  conversations: Conversation[]
  characters: Character[]
  personas: UserPersona[]
  draft: Draft
}

type Action =
  | { type: 'selectChar'; id: string }
  | { type: 'selectPersona'; id: string | null }
  | { type: 'selectModel'; id: AIProvider }
  | { type: 'startNewConv'; conv: Conversation }
  | { type: 'send'; convId: string; content: string }
  | { type: 'reply'; convId: string; content: string; modelId: AIProvider }
  | { type: 'deleteMsg'; convId: string; msgId: string }
  | { type: 'editMsg'; convId: string; msgId: string; content: string }
  | { type: 'regenerate'; convId: string }
  | { type: 'changeModel'; convId: string; modelId: AIProvider }
  | { type: 'updateCoreMemory'; convId: string; value: string }
  | { type: 'updateStatusTimeline'; convId: string; value: string }
  | { type: 'addPersona'; persona: UserPersona }
  | { type: 'editPersona'; id: string; patch: Partial<UserPersona> }
  | { type: 'deletePersona'; id: string }
  | { type: 'addCharacter'; character: Character }

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1', title: '메이와의 대화', currentAI: 'gemini',
    userPersonaId: 'persona-1', coreMemory: '유저는 저택의 주인이다.',
    statusTimeline: '저택 응접실, 오후 3시.', isSummarizing: false,
    characters: [PRESET_CHARS.find(c => c.id === 'mei')!],
    lastLine: '*메이는 찻잔을 조심스럽게 내려놓으며* "차 식기 전에 드세요."',
    when: '방금 전',
    messages: [
      { id: 'm1', role: 'assistant', content: '*메이는 찻잔을 조심스럽게 내려놓으며* "주인님… 차 식기 전에 드세요. 진짜로."', aiModel: 'gemini', isSelected: true, parentId: null },
      { id: 'm2', role: 'user', content: '오늘 손님 명단을 다시 한 번 확인해줘.', isSelected: true, parentId: null },
      { id: 'm3', role: 'assistant', content: '"네…" *메이는 잠시 망설이다 서랍에서 명단을 꺼낸다.* 일곱 분이셨는데, 지금은 여섯입니다. 그분, 마지막으로 도서관에 들어가시는 걸 봤어요.', aiModel: 'gemini', isSelected: true, parentId: null },
    ],
  },
  {
    id: 'c2', title: '오리온과의 대화', currentAI: 'gemini',
    userPersonaId: null, coreMemory: '', isSummarizing: false,
    statusTimeline: '항성간 정거장 KR-72. 통신 두절 후 17일.',
    characters: [PRESET_CHARS.find(c => c.id === 'orion')!],
    lastLine: '[경고] 외부 도킹 시도 감지.',
    when: '2시간 전',
    messages: [
      { id: 'm4', role: 'assistant', content: '[부팅 완료] 안녕하세요, 선장님. 산소 농도 96%.', aiModel: 'gemini', isSelected: true, parentId: null },
    ],
  },
]

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'selectChar':
      return { ...state, draft: { ...state.draft, charId: action.id } }
    case 'selectPersona':
      return { ...state, draft: { ...state.draft, personaId: action.id } }
    case 'selectModel':
      return { ...state, draft: { ...state.draft, modelId: action.id } }
    case 'startNewConv':
      return { ...state, conversations: [action.conv, ...state.conversations], draft: { charId: null, personaId: null, modelId: 'gemini' } }

    case 'send': {
      const msg: Message = { id: 'm' + Date.now(), role: 'user', content: action.content, isSelected: true, parentId: null }
      return { ...state, conversations: state.conversations.map(c => c.id !== action.convId ? c : { ...c, messages: [...c.messages, msg], lastLine: action.content, when: '방금 전' }) }
    }
    case 'reply': {
      const msg: Message = { id: 'm' + (Date.now() + 1), role: 'assistant', content: action.content, aiModel: action.modelId, isSelected: true, parentId: null }
      return { ...state, conversations: state.conversations.map(c => c.id !== action.convId ? c : { ...c, messages: [...c.messages, msg], lastLine: action.content, when: '방금 전' }) }
    }
    case 'deleteMsg':
      return {
        ...state, conversations: state.conversations.map(c => {
          if (c.id !== action.convId) return c
          const msgs = c.messages.filter(m => m.id !== action.msgId)
          return { ...c, messages: msgs, lastLine: msgs[msgs.length - 1]?.content ?? '' }
        })
      }
    case 'editMsg':
      return {
        ...state, conversations: state.conversations.map(c => {
          if (c.id !== action.convId) return c
          const idx = c.messages.findIndex(m => m.id === action.msgId)
          const msgs = c.messages.slice(0, idx + 1).map((m, i) => i === idx ? { ...m, content: action.content } : m)
          return { ...c, messages: msgs, lastLine: action.content }
        })
      }
    case 'regenerate':
      return { ...state, conversations: state.conversations.map(c => c.id !== action.convId ? c : { ...c, messages: c.messages.slice(0, -1) }) }
    case 'changeModel':
      return { ...state, conversations: state.conversations.map(c => c.id !== action.convId ? c : { ...c, currentAI: action.modelId }) }
    case 'updateCoreMemory':
      return { ...state, conversations: state.conversations.map(c => c.id !== action.convId ? c : { ...c, coreMemory: action.value }) }
    case 'updateStatusTimeline':
      return { ...state, conversations: state.conversations.map(c => c.id !== action.convId ? c : { ...c, statusTimeline: action.value }) }

    case 'addPersona':
      return { ...state, personas: [...state.personas, action.persona] }
    case 'editPersona':
      return { ...state, personas: state.personas.map(p => p.id !== action.id ? p : { ...p, ...action.patch }) }
    case 'deletePersona':
      return { ...state, personas: state.personas.filter(p => p.id !== action.id) }
    case 'addCharacter':
      return { ...state, characters: [...state.characters, action.character] }

    default:
      return state
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    conversations: SEED_CONVERSATIONS,
    characters: PRESET_CHARS,
    personas: PRESET_PERSONAS,
    draft: { charId: null, personaId: null, modelId: 'gemini' },
  })
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
