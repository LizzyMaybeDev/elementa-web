import { ADVANCES, FIRST } from './advances'

export const FAMILY = 'Minecraft'

export const LINE_HEIGHT = 9

const DEFAULT = 6

export function advanceOf(code: number): number {
  const at = code - FIRST
  if (at < 0 || at >= ADVANCES.length) return DEFAULT

  const digit = ADVANCES.charCodeAt(at)
  return digit <= 57 ? digit - 48 : digit - 87
}

export function measureText(text: string, scale = 1): number {
  let total = 0
  for (let at = 0; at < text.length; at++) total += advanceOf(text.charCodeAt(at))
  return total * scale
}
