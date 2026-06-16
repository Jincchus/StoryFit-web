import type { AIModel } from '@/types'

// 스토리/멀티스토리 채팅 = Pro(문체 품질↑). 무료 사용 기간 한정 — 유료 전환 시 flash로 되돌릴 것.
// TODO(비용): 무료 기간 종료 후(2026-10 예정) 'gemini-2.5-flash'로 복귀.
export const GEMINI_CHAT_MODEL = 'gemini-2.5-pro'
// 요약·리캡·핵심메모리 압축 등 백그라운드 유틸은 비용/속도 위해 flash 유지.
export const GEMINI_UTILITY_MODEL = 'gemini-2.5-flash'

export const AI_MODELS: AIModel[] = [
  { id: 'gemini', name: 'Gemini 2.5 Flash', short: 'Gemini', tag: 'GEM', className: 'gemini', disabled: false },
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
