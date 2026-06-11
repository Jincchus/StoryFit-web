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

const SEP_RE = /\n(-{3,}|\*{3,}|={3,})\s*\n/

function getChoiceBlock(text: string): string {
  const parts = text.split(SEP_RE)
  // split with capture group → [body, sep, choices]
  return parts.length >= 3 ? parts[parts.length - 1] : ''
}

function getBodyBlock(text: string): string {
  return text.split(SEP_RE)[0] ?? text
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

export function stripChoiceArtifacts(text: string): string {
  const trimmed = text.trim()
  const parts = trimmed.split(SEP_RE)
  if (parts.length >= 3) {
    return parts[0].trim()
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

export function applyLightFixes(text: string, options: boolean | ResponseRevisionOptions = false): string {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const trimmed = text.trim()
  if (!allowChoices && CHOICE_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return stripChoiceArtifacts(trimmed)
  }
  return trimmed
}

export function needsResponseRevision(text: string, options: boolean | ResponseRevisionOptions = false): boolean {
  const allowChoices = typeof options === 'boolean' ? options : !!options.allowChoices
  const forbiddenChoiceNames = typeof options === 'boolean' ? [] : options.forbiddenChoiceNames ?? []
  const requiredBodyNames = typeof options === 'boolean' ? [] : options.requiredBodyNames ?? []
  const personaName = typeof options === 'boolean' ? undefined : options.personaName

  const trimmed = text.trim()
  if (!trimmed) return false
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
  return `[Response Rewrite Request]
The previous response violated the app's response control rules or was too short.

${getResponseControlRules(allowChoices)}

Rewrite the incorrect response below as the natural next response for the same scene.
- ${allowChoices ? "Maintain story mode choices, but write them only as the user's next action/dialogue candidates." : 'Remove any choices or host-like questions.'}
- ${allowChoices && forbiddenNamesText ? `Do not include ${forbiddenNamesText}'s name, dialogue, or actions in the choices.` : 'Do not delegate AI character actions and dialogue to user choices.'}
- ${allowChoices && requiredNamesText ? `The body before the choices must include ${requiredNamesText}'s actions and dialogue.` : 'Have the AI character act and speak directly in the body.'}
- Do not confirm the user's actions/dialogue/emotions.
- Write more richly with scene narration, character actions, and dialogue.
- Output only the rewritten body without any explanation.

[Incorrect Response]
${badResponse}`
}
