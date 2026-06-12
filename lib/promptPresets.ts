import { prisma } from '@/lib/prisma'

export const PROMPT_PRESET_MODES = ['story', 'multiStory'] as const
export type PromptPresetMode = (typeof PROMPT_PRESET_MODES)[number]

export function isPromptPresetMode(value: unknown): value is PromptPresetMode {
  return value === 'story' || value === 'multiStory'
}

export function convModeToPresetMode(convMode: string): PromptPresetMode | null {
  if (convMode === 'story') return 'story'
  if (convMode === 'multiStory') return 'multiStory'
  return null
}

// 활성화된 프리셋들을 순서대로 이어붙여 시스템 프롬프트에 삽입할 "유저 개인 설정" 텍스트를 만든다.
export async function getPersonalRulesForConv(userId: string, convMode: string): Promise<string> {
  const presetMode = convModeToPresetMode(convMode)
  if (!presetMode) return ''

  const presets = await prisma.promptPreset.findMany({
    where: { userId, mode: presetMode, enabled: true },
    orderBy: { order: 'asc' },
    select: { content: true },
  })
  return presets.map(p => p.content.trim()).filter(Boolean).join('\n\n')
}
