export interface Measure {
  (text: string): number
}

export function splitToWidth(text: string, maxWidth: number, measure: Measure): string[] {
  const spaceWidth = measure(' ')

  const limit = Math.max(1, maxWidth - spaceWidth)

  const lines: string[] = []
  let current = ''

  const push = (): void => {
    lines.push(current)
    current = ''
  }

  for (const paragraph of text.split('\n')) {
    for (const word of paragraph.split(' ')) {
      if (!word) continue

      const candidate = current ? `${current} ${word}` : word
      if (measure(candidate) <= limit) {
        current = candidate
        continue
      }

      if (current) push()

      let rest = word
      while (measure(rest) > limit) {
        let take = Math.max(1, rest.length - 1)
        while (take > 1 && measure(rest.slice(0, take)) > limit) take--
        lines.push(rest.slice(0, take))
        rest = rest.slice(take)
      }
      current = rest
    }
    push()
  }

  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
