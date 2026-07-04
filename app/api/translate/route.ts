import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/apiAuth'
import { generateText } from '@/lib/ai/gemini'
import { GEMINI_CHAT_MODEL } from '@/lib/constants'

// 임의 텍스트의 언어를 파악해 한국어로 번역한다(비밀설정 등 임포트 데이터 로컬라이즈용).
// 플레이스홀더({{user}}/{{char}})·마크다운·줄바꿈 구조는 보존하고, 설명/사족 없이 번역문만 반환한다.
const SYSTEM_PROMPT = [
  '너는 번역기다. 입력 텍스트의 언어를 자동 감지해 자연스러운 한국어로 번역한다.',
  '규칙:',
  '- 번역문만 출력한다. 인사말·설명·따옴표·코드블록으로 감싸지 말 것.',
  '- `{{user}}`, `{{char}}` 같은 중괄호 플레이스홀더는 절대 번역/변형하지 말고 그대로 둔다.',
  '- 줄바꿈, 빈 줄, 마크다운(**, [], -, # 등), 섹션 제목 구조를 원문 그대로 유지한다.',
  '- 이미 한국어인 부분(고유명사, 용어 등)은 그대로 둔다.',
  '- 의미를 왜곡하거나 검열하지 말고 원문 뜻을 충실히 옮긴다.',
].join('\n')

export async function POST(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { text } = await req.json().catch(() => ({}))
  const input = typeof text === 'string' ? text.trim() : ''
  if (!input) return NextResponse.json({ error: '번역할 내용이 없습니다.' }, { status: 400 })
  if (input.length > 20000) return NextResponse.json({ error: '번역할 내용이 너무 깁니다.' }, { status: 400 })

  try {
    // 품질을 위해 chat 모델(pro) 사용. NSFW 비설도 있으므로 relaxed 안전등급 + 넉넉한 출력 토큰.
    const translated = await generateText(SYSTEM_PROMPT, input, 8192, 'relaxed', -1, GEMINI_CHAT_MODEL)
    if (!translated) return NextResponse.json({ error: '번역 결과가 비어 있습니다. 다시 시도해주세요.' }, { status: 502 })
    return NextResponse.json({ translated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '번역에 실패했습니다.' }, { status: 500 })
  }
}
