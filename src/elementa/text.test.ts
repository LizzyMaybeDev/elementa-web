import { test, expect } from 'vitest'

import { splitToWidth } from './text'

const monospace = (text: string): number => text.length * 6

test('words wrap at the width and keep their order', () => {
  const lines = splitToWidth('one two three four', 6 * 9, monospace)
  expect(lines.join('|')).toBe('one two|three|four')
})

test('a word longer than the line is broken rather than dropped', () => {
  expect(splitToWidth('abcdefgh', 6 * 4, monospace)).toEqual(['abc', 'def', 'gh'])
})

test('a width narrower than one glyph still terminates', () => {
  expect(splitToWidth('ab', 1, monospace)).toEqual(['a', 'b'])
  expect(splitToWidth('a b', 0, monospace)).toEqual(['a', 'b'])
})
