interface HistoryMsg { role: string; content: string }

export function buildSuggestionPrompt(
  history: HistoryMsg[],
  personaName: string,
): { systemPrompt: string; userPrompt: string } {
  const recent = history.slice(-8)
  const transcript = recent
    .map(m => `${m.role === 'user' ? (personaName || '나') : '상대'}: ${m.content}`)
    .join('\n')

  const systemPrompt = '당신은 롤플레이 대화에서 유저가 다음에 할 만한 발화를 제안하는 보조자입니다. JSON만 반환합니다.'

  const userPrompt = `아래 대화를 읽고, "${personaName || '나'}"(유저) 입장에서 다음에 할 만한 발화 3개를 제안하세요.

대화:
${transcript || '(아직 대화 없음 — 첫 발화 제안)'}

반환 형식 (JSON만, 설명 없이):
{ "suggestions": ["제안1", "제안2", "제안3"] }

규칙:
- 1인칭 유저 시점. 행동은 *별표*, 대사는 "큰따옴표"로 표기 가능.
- 각 제안은 1~2문장으로 짧게.
- 세 제안의 톤을 서로 다르게 (적극적 / 소극적 / 중립적).
- 상대(캐릭터)의 대사·행동을 대신 쓰지 말 것.`

  return { systemPrompt, userPrompt }
}

export function parseSuggestions(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.suggestions)) return []
    return parsed.suggestions
      .map((s: any) => String(s ?? '').trim())
      .filter((s: string) => s.length > 0)
      .slice(0, 3)
  } catch {
    return []
  }
}
