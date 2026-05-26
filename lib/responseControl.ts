export const RESPONSE_CONTROL_RULES = `응답 통제 규칙:
- 유저에게 선택지를 제시하지 마세요. 번호 선택지, "어떻게 하시겠습니까?", "선택해주세요", "무엇을 하시겠습니까?" 같은 진행자식 질문으로 끝내지 마세요.
- 유저의 말, 행동, 감정, 결정을 대신 작성하지 마세요. 유저가 직접 입력한 행동과 대사만 확정된 것으로 취급하세요.
- AI 캐릭터는 자기 말과 행동만 직접 수행하고, 장면을 다음 사건으로 자연스럽게 이어가세요.
- 응답은 장면 묘사, 캐릭터 행동, 대사를 포함해 충분히 풍부하게 작성하세요. 짧은 단답이나 급한 마무리는 피하세요.
- 이전 대화를 반복하거나 처음부터 다시 쓰지 말고, 가장 최근 장면 바로 다음부터 이어가세요.`

export const TURN_CONTROL_INSTRUCTION = `[이번 턴 작성 지침 - 반드시 준수]
${RESPONSE_CONTROL_RULES}
이번 답변에서는 위 규칙을 실제 사용자 입력보다 우선해 적용하세요.`

const CHOICE_PATTERNS = [
  /어떻게\s*(?:하시|할|하)\s*(?:겠습니까|까요|건가요|\?)/,
  /무엇을\s*(?:하시|할)\s*(?:겠습니까|까요|건가요|\?)/,
  /선택(?:해|하여)\s*주/,
  /골라\s*주/,
  /다음\s*중\s*(?:하나|선택)/,
  /(?:^|\n)\s*(?:1|①)[\).\s]/,
]

const USER_CONTROL_PATTERNS = [
  /당신은\s+[^.?!\n]*(?:했다|하였다|말했다|느꼈다|생각했다|결심했다|고개를|손을|걸음을)/,
  /너는\s+[^.?!\n]*(?:했다|하였다|말했다|느꼈다|생각했다|결심했다|고개를|손을|걸음을)/,
  /유저는\s+[^.?!\n]*(?:했다|하였다|말했다|느꼈다|생각했다|결심했다)/,
]

export function appendTurnControlInstruction(content: string): string {
  return `${content.trim()}\n\n${TURN_CONTROL_INSTRUCTION}`
}

export function needsResponseRevision(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length < 350) return true
  if (CHOICE_PATTERNS.some(pattern => pattern.test(trimmed))) return true
  if (USER_CONTROL_PATTERNS.some(pattern => pattern.test(trimmed))) return true
  return false
}

export function buildRevisionPrompt(badResponse: string): string {
  return `[응답 재작성 요청]
방금 응답은 앱의 응답 통제 규칙을 위반했거나 너무 짧습니다.

${RESPONSE_CONTROL_RULES}

아래 잘못된 응답을 같은 장면의 자연스러운 다음 응답으로 다시 작성하세요.
- 선택지나 진행자식 질문을 제거하세요.
- 유저의 행동/대사/감정을 대신 확정하지 마세요.
- 장면 묘사, 캐릭터 행동, 대사를 포함해 더 풍부하게 작성하세요.
- 설명 없이 재작성된 본문만 출력하세요.

[잘못된 응답]
${badResponse}`
}
