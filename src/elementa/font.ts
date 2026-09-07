export const FAMILY = 'Minecraft'

export const LINE_HEIGHT = 9

const DEFAULT = 6

let widths = ''
let first = 32

export function setAdvances(table: string, from = 32): void {
  widths = table
  first = from
}

export function advanceOf(code: number): number {
  const at = code - first
  if (at < 0 || at >= widths.length) return DEFAULT

  const digit = widths.charCodeAt(at)
  return digit <= 57 ? digit - 48 : digit - 87
}

export function measureText(text: string, scale = 1): number {
  let total = 0
  for (let at = 0; at < text.length; at++) total += advanceOf(text.charCodeAt(at))
  return total * scale
}
