
import { UIComponent } from './component'
import { type Color, toCss } from './color'
import { Constraint, ConstantColorConstraint } from './constraints'
import { LINE_HEIGHT, advanceOf, measureText } from './font'
import {
  type MarkName,
  MARKS,
  markDrop,
  markHeight,
  markInk,
  markWidth,
  wear,
} from './marks'
import { type State, toState } from './state'
import { setStyle } from './style'
import { shadowFor, shimmer } from './effects'

export type Words = {
  words: string
  colour?: State<Color>
  lit?: boolean
  onPress?: () => void
}
export type Mark = { mark: MarkName; colour?: State<Color>; lit?: boolean }
export type Piece = Words | Mark

export type Inks = Record<string, State<Color>>

const SPACE = 32

const isMark = (piece: Piece): piece is Mark => 'mark' in piece

const spanOf = (piece: Piece): number =>
  isMark(piece) ? markWidth(piece.mark) : measureText(piece.words)

export function rich(said: string, inks: Inks): Piece[] {
  const pieces: Piece[] = []
  let plain = ''

  const flush = (): void => {
    if (plain) pieces.push({ words: plain })
    plain = ''
  }

  for (let at = 0; at < said.length; at++) {
    const shut = said[at] === '{' ? said.indexOf('}', at) : -1
    if (shut < 0) {
      plain += said[at]
      continue
    }

    const held = said.slice(at + 1, shut)
    const colon = held.indexOf(':')
    const names = (colon < 0 ? held : held.slice(0, colon)).split(' ').filter(Boolean)

    if (colon < 0) {
      const drawn = names.find((name) => name in MARKS)
      if (!drawn) {
        plain += said.slice(at, shut + 1)
        at = shut
        continue
      }
      flush()
      const mark = drawn as MarkName
      pieces.push({
        mark,
        colour: names.map((name) => inks[name]).find(Boolean) ?? inks[markInk(mark) ?? ''],
        lit: names.includes('shine'),
      })
    } else {
      flush()
      pieces.push({
        words: held.slice(colon + 1),
        colour: names.map((name) => inks[name]).find(Boolean),
        lit: names.includes('shine'),
      })
    }
    at = shut
  }

  flush()
  return pieces
}

export const pressed = (words: string, onPress: () => void, colour?: State<Color>): Words => ({
  words,
  colour,
  onPress,
})

export const saying =
  (inks: Inks) =>
  (said: string): Piece[] =>
    rich(said, inks)

export interface RichOptions {
  scale?: number
  colour?: Color | State<Color>
  shadow?: boolean
  lineSpacing?: number
  centred?: boolean
  heading?: 1 | 2 | 3
}

class RichHeightConstraint extends Constraint {
  protected override size(component: UIComponent): number {
    const held = component as UIRich
    return held.lines().length * held.lineHeight() - held.lineSpacing * held.scale
  }
}

class RichWidthConstraint extends Constraint {
  protected override size(component: UIComponent): number {
    const held = component as UIRich
    let widest = 0
    for (const line of held.lines()) {
      let taken = 0
      for (const piece of line) taken += spanOf(piece)
      widest = Math.max(widest, taken)
    }
    return widest * held.scale
  }
}

export class UIRich extends UIComponent {
  override name = 'UIRich'
  override readonly tag: string

  private readonly said: State<Piece[]>
  private laid: { pieces: Piece[]; width: number; lines: Piece[][] } | null = null
  private wrote = ''
  private painted: { span: HTMLElement; ink: HTMLElement; piece: Piece; was: string }[] = []
  private taps: (() => void)[] = []
  readonly scale: number
  readonly shadow: boolean
  readonly lineSpacing: number
  readonly centred: boolean

  constructor(
    said: Piece[] | State<Piece[]>,
    options: RichOptions = {},
    readonly wraps = false,
  ) {
    super()
    this.tag = options.heading ? `h${options.heading}` : 'div'
    this.said = toState(said)
    this.scale = options.scale ?? 1
    this.shadow = options.shadow ?? true
    this.lineSpacing = options.lineSpacing ?? 2
    this.centred = options.centred ?? false
    if (options.colour) this.color = new ConstantColorConstraint(options.colour)
    if (!wraps) this.width = new RichWidthConstraint()
    this.height = new RichHeightConstraint()
  }

  lineHeight(): number {
    return (LINE_HEIGHT + this.lineSpacing) * this.scale
  }

  lines(): Piece[][] {
    const pieces = this.said.get()
    const width = this.wraps ? this.getWidth() / this.scale : Infinity
    const held = this.laid
    if (held && held.pieces === pieces && held.width === width) return held.lines
    const lines = wrap(pieces, width)
    this.laid = { pieces, width, lines }
    return lines
  }

  override paint(element: HTMLElement, scale: number): void {
    const colour = this.getColor()
    const pixel = this.scale * scale
    const size = LINE_HEIGHT * pixel
    const step = this.lineHeight() * scale

    setStyle(element, 'font-size', `${size}px`)
    setStyle(element, 'line-height', `${step}px`)
    setStyle(element, 'margin-top', `${(size - step) / 2}px`)
    setStyle(element, 'text-align', this.centred ? 'center' : '')
    setStyle(element, 'color', toCss(colour))
    setStyle(element, 'text-shadow', shadowFor(colour, pixel, this.shadow))
    setStyle(element, '--glimmer', `${pixel}px`)

    const lines = this.lines()
    const glow = lines.some((line) => line.some((piece) => isMark(piece) && piece.lit))
    setStyle(element, 'clip-path', glow ? 'none' : `inset(${-pixel * 2}px 0px)`)
    const anything = lines.some((line) => line.some((piece) => !isMark(piece) && piece.onPress))
    this.onClick = anything ? this.press : null
    this.cursor = anything ? '' : null

    const now = lines.map((line) => line.map(stamp).join('\x01')).join('\n')
    if (now !== this.wrote) {
      this.wrote = now
      element.textContent = ''
      this.taps = []
      this.painted = []
      lines.forEach((line, at) => {
        if (at > 0) element.appendChild(document.createTextNode('\n'))
        for (const piece of line) {
          const span = write(piece)
          if (!isMark(piece) && piece.onPress) {
            span.dataset.tap = `${this.taps.length}`
            span.classList.add('tap')
            this.taps.push(piece.onPress)
          }
          const ink = (span.firstElementChild as HTMLElement | null) ?? span
          this.painted.push({ span, ink, piece, was: '' })
          element.appendChild(span)
        }
      })
    }

    for (const held of this.painted) {
      const piece = held.piece
      const want = isMark(piece)
        ? toCss(piece.colour?.get() ?? colour)
        : piece.colour
          ? toCss(piece.colour.get())
          : ''
      if (want === held.was) continue
      held.was = want
      if (!isMark(piece)) {
        held.span.style.color = want
        continue
      }
      held.ink.style.backgroundColor = want
      if (piece.lit) held.span.style.color = want
    }
  }

  private readonly press = (event: MouseEvent): void => {
    const at = (event.target as HTMLElement | null)?.dataset?.tap
    if (at !== undefined) this.taps[Number(at)]?.()
  }
}

const stamp = (piece: Piece): string =>
  isMark(piece) ? `M${piece.lit ? '~' : ''}${piece.mark}` : `T${piece.lit ? '~' : ''}${piece.words}`

function write(piece: Piece): HTMLElement {
  const span = document.createElement('span')

  if (isMark(piece)) {
    const wide = MARKS[piece.mark].rows[0].length
    span.style.display = 'inline-block'
    span.style.width = `${wide / LINE_HEIGHT}em`
    span.style.height = `${markHeight(piece.mark) / LINE_HEIGHT}em`
    span.style.verticalAlign = `${-markDrop(piece.mark) / LINE_HEIGHT}em`
    if (!piece.lit) {
      wear(span, piece.mark)
      return span
    }
    shimmer()
    span.classList.add('glimmer')
    const cut = document.createElement('span')
    cut.style.display = 'block'
    cut.style.width = '100%'
    cut.style.height = '100%'
    wear(cut, piece.mark)
    span.appendChild(cut)
    return span
  }

  span.textContent = piece.words
  if (piece.lit) {
    shimmer()
    span.dataset.shine = piece.words
    span.classList.add('shining')
  }
  return span
}

function wrap(pieces: Piece[], maxWidth: number): Piece[][] {
  const limit = Math.max(1, maxWidth - advanceOf(SPACE))
  const lines: Piece[][] = []
  let line: Piece[] = []
  let taken = 0

  const push = (): void => {
    lines.push(line)
    line = []
    taken = 0
  }

  for (const piece of pieces) {
    if (isMark(piece)) {
      const room = spanOf(piece)
      if (taken + room > limit && line.length) push()
      line.push(piece)
      taken += room
      continue
    }

    piece.words.split('\n').forEach((paragraph, at) => {
      if (at > 0) push()
      let held = ''
      let wide = 0
      const keep = (): void => {
        if (held) {
          line.push({ ...piece, words: held })
          taken += wide
        }
        held = ''
        wide = 0
      }

      paragraph.split(' ').forEach((word, index) => {
        const gap = index > 0 ? advanceOf(SPACE) : 0
        const room = measureText(word)
        if (taken + wide + gap + room > limit && (line.length > 0 || held)) {
          keep()
          push()
          held = word
          wide = room
          return
        }
        held += (index > 0 ? ' ' : '') + word
        wide += gap + room
      })
      keep()
    })
  }

  if (line.length || !lines.length) push()
  while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop()
  return lines
}
