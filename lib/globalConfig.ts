import { prisma } from '@/lib/prisma'

export async function loadGlobalRules(mode: string): Promise<{
  globalRules: string
  modeRules: string
  closingRules: string
}> {
  const modeKey = mode === 'multiStory' ? 'multiStory' : 'story'
  const [globalConfig, modeConfig, closingConfig] = await Promise.all([
    prisma.globalConfig.findUnique({ where: { key: 'global_rules' } }),
    prisma.globalConfig.findUnique({ where: { key: `${modeKey}_rules` } }),
    prisma.globalConfig.findUnique({ where: { key: `${modeKey}_closing` } }),
  ])
  return {
    globalRules: globalConfig?.value ?? '',
    modeRules: modeConfig?.value ?? '',
    closingRules: closingConfig?.value ?? '',
  }
}
