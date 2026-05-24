import { prisma } from './prisma'

interface AiErrorParams {
  userId?: string
  conversationId?: string
  provider?: string
  mode?: string
  errorType: 'api_error' | 'timeout' | 'empty_response' | 'partial_save' | 'network'
  statusCode?: number
  message?: string
  inputTokens?: number
  outputTokens?: number
}

export function logAiError(params: AiErrorParams): void {
  prisma.aiErrorLog.create({
    data: {
      userId: params.userId ?? '',
      conversationId: params.conversationId ?? '',
      provider: params.provider ?? '',
      mode: params.mode ?? '',
      errorType: params.errorType,
      statusCode: params.statusCode ?? 0,
      message: (params.message ?? '').slice(0, 1000),
      inputTokens: params.inputTokens ?? 0,
      outputTokens: params.outputTokens ?? 0,
    },
  }).catch(err => console.error('[errorLog] failed to save:', err))
}
