export interface AlternativeGreeting {
  title: string
  text: string
}

export function parseAlternativeGreetings(openingMessage: string, additionalInfo: string): AlternativeGreeting[] {
  const list: AlternativeGreeting[] = []
  if (openingMessage?.trim()) {
    list.push({ title: '기본 시작 상황', text: openingMessage.trim() })
  }

  const match = additionalInfo?.match(/\[다른 시작 상황\]\n([\s\S]*)/)
  if (match && match[1]) {
    const block = match[1]
    const intros = block.split(/\n\n(?=도입부: )/)
    for (const intro of intros) {
      const introLines = intro.split('\n')
      const titleLine = introLines[0] || ''
      if (titleLine.startsWith('도입부: ')) {
        const title = titleLine.replace('도입부: ', '').trim()
        const text = introLines.slice(1).join('\n').trim()
        if (title && text) {
          list.push({ title, text })
        }
      }
    }
  }
  return list
}
