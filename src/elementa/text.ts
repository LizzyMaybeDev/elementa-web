import { advanceOf, measureText } from './font'

const SPACE = 32

export function splitToWidth(text: string, maxWidth: number): string[] {
  const space = advanceOf(SPACE)
  const limit = Math.max(1, maxWidth - space)

  const lines: string[] = []
  let current = ''
  let taken = 0

  const push = (): void => {
    lines.push(current)
    current = ''
    taken = 0
  }

  for (const paragraph of text.split('\n')) {
    for (const word of paragraph.split(' ')) {
      if (!word) continue

      const wide = measureText(word)
      const joined = current ? taken + space + wide : wide
      if (joined <= limit) {
        current = current ? `${current} ${word}` : word
        taken = joined
        continue
      }

      if (current) push()

      let from = 0
      let run = 0
      for (let at = 0; at < word.length; at++) {
        const glyph = advanceOf(word.charCodeAt(at))
        if (run + glyph > limit && at > from) {
          lines.push(word.slice(from, at))
          from = at
          run = 0
        }
        run += glyph
      }
      current = word.slice(from)
      taken = run
    }
    push()
  }

  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
