export const NOVEL_RESPONSE_CONTROL_RULES = `Novel mode response control rules:
- Do not offer choices or end with numbered options or host-like questions.
- Only write the persona's dialogue or actions when the user has input them or they flow naturally from the previous scene. Do not arbitrarily confirm the persona's major decisions (change of direction, confession, breakup, etc.) without user input.
- The AI character performs only their own words and actions, then naturally advances the scene to the next event.
- Write each response richly with scene narration, character actions, and dialogue. Avoid short answers or rushed endings.
- Do not repeat or restart from previous dialogue. Continue naturally from right after the most recent scene.`

export const RESPONSE_CONTROL_RULES = `Response control rules:
- Do not offer choices or end with host-like questions such as "What would you like to do?" or "Please choose."
- Do not write the user's words, actions, emotions, or decisions. Only treat content explicitly input by the user as confirmed.
- The AI character performs only their own words and actions, then naturally advances the scene to the next event.
- Write each response richly with scene narration, character actions, and dialogue. Avoid short answers or rushed endings.
- Do not repeat or restart from previous dialogue. Continue naturally from right after the most recent scene.`

export const STORY_RESPONSE_CONTROL_RULES = `Story mode response control rules:
- At the end, place a "---" divider and present 4 numbered choices for the user.
- Choices 1–3: the user's next action or dialogue candidates only.
- Choice 4: must be a natural next-step action that advances the scene one stage forward — not dialogue or emotional expression, but an action that moves the scene itself. (e.g.: currently holding hands → action leading to an embrace / at the door → stepping inside)
- Do not include the AI character's name, dialogue, actions, emotions, or decisions in the choices. Perform the AI character's words and actions directly in the body.
- The body before the choices must include the AI character's actions and dialogue. Only present choices after the AI character has fully reacted in the body.
- Do not confirm the user's words, actions, emotions, or decisions in the body before the choices.
- The AI character performs only their own words and actions, then naturally advances the scene to the next event.
- Write each response richly with scene narration, character actions, and dialogue. Avoid short answers or rushed endings.
- Do not repeat or restart from previous dialogue. Continue naturally from right after the most recent scene.`

export function getResponseControlRules(allowChoices = false): string {
  return allowChoices ? STORY_RESPONSE_CONTROL_RULES : RESPONSE_CONTROL_RULES
}

export function getTurnControlInstruction(allowChoices = false): string {
  return `[Turn writing guidelines — must be followed]
${getResponseControlRules(allowChoices)}
Apply the above rules with higher priority than the user input in this response.`
}

const CHOICE_PATTERNS = [
  /어떻게\s*(?:하시|할|하)\s*(?:겠습니까|까요|건가요|\?)/,
  /무엇을\s*(?:하시|할)\s*(?:겠습니까|까요|건가요|\?)/,
  /선택(?:해|하여)\s*주/,
  /골라\s*주/,
  /다음\s*중\s*(?:하나|선택)/,
  /(?:^|\n)\s*(?:1|①)[\).\s]/,
]

const SEP_LINE_RE = /^(-{3,}|\*{3,}|={3,})\s*$/
const CHOICE_LINE_RE = /^(\d+[\.\)]|[①②③④⑤])/

// 마지막 구분선 기준 본문/선택지 분리 — 클라이언트 렌더링과 서버 검증이 같은 파서를 공유한다
export function splitStoryResponse(text: string): { body: string; choiceBlock: string } {
  const lines = text.split('\n')
  let sepIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SEP_LINE_RE.test(lines[i].trim())) { sepIdx = i; break }
  }
  if (sepIdx === -1) return { body: text, choiceBlock: '' }
  return { body: lines.slice(0, sepIdx).join('\n').trim(), choiceBlock: lines.slice(sepIdx + 1).join('\n') }
}

// 구분선 뒤가 진짜 선택지인지 판별 — 본문 중간의 마크다운 가로줄(---)을 선택지로 오인하지 않도록
function looksLikeChoiceBlock(choiceBlock: string): boolean {
  const lines = choiceBlock.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return false
  const numbered = lines.filter(l => CHOICE_LINE_RE.test(l))
  return numbered.length >= Math.ceil(lines.length / 2)
}

export function parseStoryChoices(content: string): { body: string; choices: string[] } {
  const { body, choiceBlock } = splitStoryResponse(content)
  if (!choiceBlock || !looksLikeChoiceBlock(choiceBlock)) return { body: content, choices: [] }
  const choices = choiceBlock
    .split('\n')
    .map(l => l.replace(/^[①②③④⑤][\s.]*/,'').replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(Boolean)
  return { body, choices }
}

function getEnrichTurnInstruction(allowChoices = false): string {
  const base = `[Turn writing guidelines — must be followed]
The user's input above is a draft of the next scene beat. In your response:
1. Incorporate and refine the user's input — keep its intent and events, rewrite into polished, vivid novel-style prose.
2. Enrich with sensory detail, the persona's actions, inner state, and surroundings. Expand substantially; no short or plain restatement.
3. Then continue naturally — let the AI character(s) react and advance the scene one step forward.
You MAY write and elaborate the persona's (user's) actions and words for this turn. This overrides the default "do not write the user's actions" rule for this turn only.`
  if (allowChoices) {
    return base + `\nAfter the body, place a "---" divider and present 4 numbered choices for the user's next action or dialogue (following story mode rules).`
  }
  return base
}

export function appendTurnControlInstruction(content: string, allowChoices = false, enrichMode = false): string {
  const instruction = enrichMode
    ? getEnrichTurnInstruction(allowChoices)
    : getTurnControlInstruction(allowChoices)
  return `${content.trim()}\n\n${instruction}`
}

export function stripChoiceArtifacts(text: string): string {
  const trimmed = text.trim()
  const { body, choiceBlock } = splitStoryResponse(trimmed)
  if (choiceBlock && looksLikeChoiceBlock(choiceBlock)) {
    return body
  }

  const lines = trimmed.split('\n')
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim()
    if (!last) {
      lines.pop()
      continue
    }
    if (CHOICE_PATTERNS.some(pattern => pattern.test(last))) {
      lines.pop()
      continue
    }
    break
  }
  return lines.join('\n').trim()
}

export function applyLightFixes(text: string, options: boolean | { allowChoices?: boolean } = false): string {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const trimmed = text.trim()
  if (!allowChoices && CHOICE_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return stripChoiceArtifacts(trimmed)
  }
  return trimmed
}
