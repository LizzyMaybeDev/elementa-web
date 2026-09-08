export interface Color {
  r: number
  g: number
  b: number
  a: number
}

export function rgba(r: number, g: number, b: number, a = 255): Color {
  return { r, g, b, a }
}

export function hex(value: string): Color {
  let s = value.replace('#', '').trim()
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length === 6) s += 'ff'
  const n = parseInt(s, 16)
  return {
    r: (n >>> 24) & 0xff,
    g: (n >>> 16) & 0xff,
    b: (n >>> 8) & 0xff,
    a: n & 0xff,
  }
}

const css = new WeakMap<Color, string>()

export function toCss(color: Color): string {
  let held = css.get(color)
  if (held === undefined) {
    const a = color.a / 255
    held = `rgba(${color.r | 0}, ${color.g | 0}, ${color.b | 0}, ${a.toFixed(4)})`
    css.set(color, held)
  }
  return held
}

export function withAlpha(color: Color, alpha: number): Color {
  return { ...color, a: alpha }
}

export function shadowOf(color: Color): Color {
  return { r: color.r / 4, g: color.g / 4, b: color.b / 4, a: color.a }
}

export function lerp(from: Color, to: Color, t: number): Color {
  const c = Math.max(0, Math.min(1, t))
  return {
    r: from.r + (to.r - from.r) * c,
    g: from.g + (to.g - from.g) * c,
    b: from.b + (to.b - from.b) * c,
    a: from.a + (to.a - from.a) * c,
  }
}

export function brighter(color: Color): Color {
  const FACTOR = 0.7
  const LEAST = 3
  const { r, g, b } = color
  if (r === 0 && g === 0 && b === 0) return rgba(LEAST, LEAST, LEAST, color.a)
  const up = (value: number): number =>
    Math.min(255, Math.round((value > 0 && value < LEAST ? LEAST : value) / FACTOR))
  return rgba(up(r), up(g), up(b), color.a)
}

export const TRANSPARENT: Color = rgba(0, 0, 0, 0)

export const sameColor = (a: Color, b: Color): boolean =>
  a === b || (a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a)
