import { prisma } from '@/lib/prisma'

export async function loadGlobalRules(mode: string): Promise<{ globalRules: string; modeRules: string }> {
  const [globalRulesConfig, modeRulesConfig] = await Promise.all([
    prisma.globalConfig.findUnique({ where: { key: 'global_rules' } }),
    prisma.globalConfig.findUnique({ where: { key: mode === 'novel' ? 'novel_rules' : 'roleplay_rules' } }),
  ])
  return {
    globalRules: globalRulesConfig?.value ?? '',
    modeRules: modeRulesConfig?.value ?? '',
  }
}
