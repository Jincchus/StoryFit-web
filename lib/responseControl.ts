export const NOVEL_RESPONSE_CONTROL_RULES = `소설 모드 응답 통제 규칙:
- 유저에게 선택지를 제시하지 마세요. 번호 선택지, 진행자식 질문으로 끝내지 마세요.
- 페르소나의 대사·행동은 유저가 입력했거나 직전 장면에서 자연스럽게 이어지는 경우에만 작성하세요. 페르소나의 중대한 선택(방향 전환, 고백, 결별 등)은 유저 입력 없이 임의로 확정하지 마세요.
- AI 캐릭터는 자기 말과 행동만 직접 수행하고, 장면을 다음 사건으로 자연스럽게 이어가세요.
- 응답은 장면 묘사, 캐릭터 행동, 대사를 포함해 충분히 풍부하게 작성하세요. 짧은 단답이나 급한 마무리는 피하세요.
- 이전 대화를 반복하거나 처음부터 다시 쓰지 말고, 가장 최근 장면 바로 다음부터 이어가세요.`

export const RESPONSE_CONTROL_RULES = `응답 통제 규칙:
- 유저에게 선택지를 제시하지 마세요. 번호 선택지, "어떻게 하시겠습니까?", "선택해주세요", "무엇을 하시겠습니까?" 같은 진행자식 질문으로 끝내지 마세요.
- 유저의 말, 행동, 감정, 결정을 대신 작성하지 마세요. 유저가 직접 입력한 행동과 대사만 확정된 것으로 취급하세요.
- AI 캐릭터는 자기 말과 행동만 직접 수행하고, 장면을 다음 사건으로 자연스럽게 이어가세요.
- 응답은 장면 묘사, 캐릭터 행동, 대사를 포함해 충분히 풍부하게 작성하세요. 짧은 단답이나 급한 마무리는 피하세요.
- 이전 대화를 반복하거나 처음부터 다시 쓰지 말고, 가장 최근 장면 바로 다음부터 이어가세요.`

export const STORY_RESPONSE_CONTROL_RULES = `스토리 모드 응답 통제 규칙:
- 응답 마지막에 "---" 구분선을 넣고, 유저가 선택할 수 있는 선택지 4개를 번호로 제시하세요.
- 선택지 1~3번은 유저의 다음 행동이나 대사 후보만 포함하세요.
- 선택지 4번은 반드시 현재 장면에서 자연스럽게 한 단계 앞으로 나아가는 행동이어야 합니다. 대화나 감정 표현이 아닌, 장면 자체를 진전시키는 행동으로 작성하세요. (예: 손을 잡은 상황 → 포옹으로 이어지는 행동 / 문 앞 상황 → 집 안으로 들어가는 행동)
- 선택지 안에 AI 캐릭터의 이름, 대사, 행동, 감정, 결정을 넣지 마세요. AI 캐릭터가 할 말과 행동은 본문에서 직접 수행하세요.
- 선택지 앞의 본문에는 반드시 AI 캐릭터의 행동과 대사를 포함하세요. 선택지는 AI 캐릭터가 본문에서 충분히 반응한 뒤에만 제시하세요.
- 선택지 앞의 본문에서는 유저의 말, 행동, 감정, 결정을 대신 확정하지 마세요.
- AI 캐릭터는 자기 말과 행동만 직접 수행하고, 장면을 다음 사건으로 자연스럽게 이어가세요.
- 응답은 장면 묘사, 캐릭터 행동, 대사를 포함해 충분히 풍부하게 작성하세요. 짧은 단답이나 급한 마무리는 피하세요.
- 이전 대화를 반복하거나 처음부터 다시 쓰지 말고, 가장 최근 장면 바로 다음부터 이어가세요.`

export function getResponseControlRules(allowChoices = false): string {
  return allowChoices ? STORY_RESPONSE_CONTROL_RULES : RESPONSE_CONTROL_RULES
}

export function getTurnControlInstruction(allowChoices = false): string {
  return `[이번 턴 작성 지침 - 반드시 준수]
${getResponseControlRules(allowChoices)}
이번 답변에서는 위 규칙을 실제 사용자 입력보다 우선해 적용하세요.`
}

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

export interface ResponseRevisionOptions {
  allowChoices?: boolean
  forbiddenChoiceNames?: string[]
  requiredBodyNames?: string[]
  personaName?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getChoiceBlock(text: string): string {
  const parts = text.split(/\n---+\s*\n/)
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

function getBodyBlock(text: string): string {
  return text.split(/\n---+\s*\n/)[0] ?? text
}

function hasForbiddenChoiceSpeaker(text: string, names: string[] = []): boolean {
  const choiceBlock = getChoiceBlock(text)
  if (!choiceBlock.trim()) return false
  return names
    .map(name => name.trim())
    .filter(Boolean)
    .some(name => {
      const escaped = escapeRegExp(name)
      return new RegExp(`(?:^|\\n)\\s*(?:\\d+|[①②③④⑤])?[\\).\\s-]*${escaped}\\s*:`, 'u').test(choiceBlock)
    })
}

function missesRequiredBodySpeaker(text: string, names: string[] = []): boolean {
  const bodyBlock = getBodyBlock(text)
  const requiredNames = names.map(name => name.trim()).filter(Boolean)
  if (requiredNames.length === 0) return false
  return requiredNames.some(name => {
    const escaped = escapeRegExp(name)
    return !new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:`, 'u').test(bodyBlock)
  })
}

export function appendTurnControlInstruction(content: string, allowChoices = false): string {
  return `${content.trim()}\n\n${getTurnControlInstruction(allowChoices)}`
}

export function needsResponseRevision(text: string, options: boolean | ResponseRevisionOptions = false): boolean {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const forbiddenChoiceNames = typeof options === 'boolean' ? [] : options.forbiddenChoiceNames ?? []
  const requiredBodyNames = typeof options === 'boolean' ? [] : options.requiredBodyNames ?? []
  const personaName = typeof options === 'boolean' ? undefined : options.personaName

  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length < 350) return true
  if (!allowChoices && CHOICE_PATTERNS.some(pattern => pattern.test(trimmed))) return true
  if (allowChoices && hasForbiddenChoiceSpeaker(trimmed, forbiddenChoiceNames)) return true
  if (allowChoices && missesRequiredBodySpeaker(trimmed, requiredBodyNames)) return true
  if (USER_CONTROL_PATTERNS.some(pattern => pattern.test(trimmed))) return true

  if (personaName) {
    const escapedPersona = escapeRegExp(personaName)
    const bodyBlock = getBodyBlock(trimmed)
    
    // Check for "PersonaName : " in the body block
    const personaDialoguePattern = new RegExp(`(?:^|\\n)\\s*${escapedPersona}\\s*:`, 'u')
    if (personaDialoguePattern.test(bodyBlock)) return true

    // Check for "PersonaName did X / felt Y" actions in the body block
    const personaActionPattern = new RegExp(`${escapedPersona}(?:은|는|이|가)?\\s+[^.?!\\n]*(?:했다|하였다|말했다|느꼈다|생각했다|결심했다|고개를|손을|걸음을)`, 'u')
    if (personaActionPattern.test(bodyBlock)) return true
  }

  return false
}

export function buildRevisionPrompt(badResponse: string, options: boolean | ResponseRevisionOptions = false): string {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const forbiddenChoiceNames = typeof options === 'boolean' ? [] : options.forbiddenChoiceNames ?? []
  const requiredBodyNames = typeof options === 'boolean' ? [] : options.requiredBodyNames ?? []
  const forbiddenNamesText = forbiddenChoiceNames.filter(Boolean).join(', ')
  const requiredNamesText = requiredBodyNames.filter(Boolean).join(', ')
  return `[응답 재작성 요청]
방금 응답은 앱의 응답 통제 규칙을 위반했거나 너무 짧습니다.

${getResponseControlRules(allowChoices)}

아래 잘못된 응답을 같은 장면의 자연스러운 다음 응답으로 다시 작성하세요.
- ${allowChoices ? '스토리 모드 선택지는 유지하되, 유저의 다음 행동/대사 후보로만 작성하세요.' : '선택지나 진행자식 질문을 제거하세요.'}
- ${allowChoices && forbiddenNamesText ? `선택지에는 ${forbiddenNamesText}의 이름, 대사, 행동을 절대 넣지 마세요.` : 'AI 캐릭터의 행동과 대사는 유저 선택지로 넘기지 마세요.'}
- ${allowChoices && requiredNamesText ? `선택지 앞 본문에는 ${requiredNamesText}의 행동과 대사를 반드시 포함하세요.` : 'AI 캐릭터가 본문에서 직접 행동하고 말하게 하세요.'}
- 유저의 행동/대사/감정을 대신 확정하지 마세요.
- 장면 묘사, 캐릭터 행동, 대사를 포함해 더 풍부하게 작성하세요.
- 설명 없이 재작성된 본문만 출력하세요.

[잘못된 응답]
${badResponse}`
}
