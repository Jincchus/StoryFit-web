import type { AIModel } from '@/types'

export const GEMINI_CHAT_MODEL = 'gemini-2.5-flash'
export const GEMINI_UTILITY_MODEL = 'gemini-2.5-flash'

export const AI_MODELS: AIModel[] = [
  { id: 'gemini',  name: 'Gemini 2.0 Flash', short: 'Gemini', tag: 'GEM', className: 'gemini', disabled: false },
  { id: 'claude',  name: 'Claude (준비 중)',  short: 'Claude', tag: 'AI',  className: '',        disabled: true  },
  { id: 'chatgpt', name: 'GPT-4o (준비 중)', short: 'GPT-4o', tag: 'GPT', className: 'gpt',     disabled: true  },
]

export const DEFAULT_TAGS = ['판타지', 'SF', '로맨스', '일상', '고딕', '액션', '미스터리', '사이버', '자연', '기사도']

export const RANDOM_NAMES = [
  '이루리', '하이든', '세라', '나린', '유이', '아리엘', '카이', '레나',
  '이안', '소라', '미루', '하루', '에린', '지온', '루나', '세이',
  '카엘', '리아', '제온', '누리', '비엘', '테온', '샤인', '이레',
  '로엔', '하윤', '제이', '리온', '세아', '루이', '카린', '엘리',
]

export const SAFETY_LEVELS: Array<{ value: string; label: string }> = [
  { value: 'strict',   label: 'Strict (엄격)' },
  { value: 'standard', label: 'Standard (표준)' },
  { value: 'relaxed',  label: 'Relaxed (완화)' },
]
