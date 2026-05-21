import { prisma } from '@/lib/prisma'

export async function logAdminAction(adminId: string, action: string, detail: string) {
  await prisma.adminLog.create({ data: { adminId, action, detail } }).catch(() => {})
}
