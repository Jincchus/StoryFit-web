type JosaPair = '은/는' | '이/가' | '을/를' | '와/과' | '로/으로' | '(이)라' | '(이)나' | '(이)며'

function getJosa(word: string, pair: JosaPair): string {
  const lastChar = word.trim().slice(-1)
  const code = lastChar.charCodeAt(0) - 0xac00
  const isHangulSyllable = code >= 0 && code <= 11171
  const jong = isHangulSyllable ? code % 28 : 0
  const hasFinal = isHangulSyllable && jong !== 0

  switch (pair) {
    case '은/는': return hasFinal ? '은' : '는'
    case '이/가': return hasFinal ? '이' : '가'
    case '을/를': return hasFinal ? '을' : '를'
    case '와/과': return hasFinal ? '과' : '와'
    case '로/으로': return (!hasFinal || jong === 8) ? '로' : '으로'
    case '(이)라': return hasFinal ? '이라' : '라'
    case '(이)나': return hasFinal ? '이나' : '나'
    case '(이)며': return hasFinal ? '이며' : '며'
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function fixJosa(text: string, names: (string | undefined | null)[]): string {
  let result = text
  for (const name of names) {
    if (!name) continue
    const escaped = escapeRegExp(name)

    result = result.replace(new RegExp(`${escaped}(이라|라)`, 'g'), `${name}${getJosa(name, '(이)라')}`)
    result = result.replace(new RegExp(`${escaped}(이나|나)`, 'g'), `${name}${getJosa(name, '(이)나')}`)
    result = result.replace(new RegExp(`${escaped}(이며|며)`, 'g'), `${name}${getJosa(name, '(이)며')}`)

    result = result.replace(new RegExp(`${escaped}(으로|로)`, 'g'), `${name}${getJosa(name, '로/으로')}`)

    result = result.replace(new RegExp(`${escaped}(은|는)`, 'g'), `${name}${getJosa(name, '은/는')}`)
    result = result.replace(new RegExp(`${escaped}(이|가)`, 'g'), `${name}${getJosa(name, '이/가')}`)
    result = result.replace(new RegExp(`${escaped}(을|를)`, 'g'), `${name}${getJosa(name, '을/를')}`)
    result = result.replace(new RegExp(`${escaped}(와|과)`, 'g'), `${name}${getJosa(name, '와/과')}`)
  }
  return result
}

export function applyPersonaPlaceholders(text: string, personaName: string, charName?: string): string {
  let result = text
  if (charName) {
    result = result
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/\{char\}/gi, charName)
      .replace(/\{캐릭터\}/g, charName)
  }
  return result
    .replace(/\{\{user\}\}/gi, personaName)
    .replace(/\{user\}/gi, personaName)
    .replace(/\{유저\}/g, personaName)
    .replace(/\[유저\]/g, personaName)
    .replace(/\[USER\]/gi, personaName)
    .replace(/\bguest\b/gi, personaName)
    .replace(/\bpersona\b/gi, personaName)
    .replace(/페르소나/g, personaName)
    .replace(/주인공/g, personaName)
    .replace(/\buser\b/gi, personaName)
    .replace(/당신/g, personaName)
}

export function replaceDisplayPlaceholders(text: string, userName: string, charName?: string): string {
  return fixJosa(applyPersonaPlaceholders(text, userName, charName), [userName, charName])
}
