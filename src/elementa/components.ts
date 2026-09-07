import { UIComponent } from './component'
import { type Color, toCss, TRANSPARENT } from './color'
import { setStyle } from './style'
import { type Axis, Constraint, ConstantColorConstraint, PixelConstraint } from './constraints'
import { type State, toState } from './state'
import { LINE_HEIGHT, measureText } from './font'
import { splitToWidth } from './text'
import { shadowFor } from './effects'

export class UIContainer extends UIComponent {
  override name = 'UIContainer'
}

export class UIBlock extends UIComponent {
  override name = 'UIBlock'

  constructor(color: Color | State<Color> = TRANSPARENT) {
    super()
    this.color = new ConstantColorConstraint(color)
  }

  override paint(element: HTMLElement): void {
    setStyle(element, 'background-color', toCss(this.getColor()))
  }
}

export class UIRoundedRectangle extends UIComponent {
  override name = 'UIRoundedRectangle'

  constructor(
    readonly radius: number,
    color: Color | State<Color> = TRANSPARENT,
  ) {
    super()
    this.color = new ConstantColorConstraint(color)
  }

  override paint(element: HTMLElement, scale: number): void {
    setStyle(element, 'background-color', toCss(this.getColor()))
    setStyle(element, 'border-radius', `${this.radius * scale}px`)
  }
}

const say = (node: Node, words: string): void => {
  if (node.textContent !== words) node.textContent = words
}

class TextSizeConstraint extends Constraint {
  protected override size(component: UIComponent, axis: Axis): number {
    const text = component as UIText
    return axis.horizontal
      ? measureText(text.getText(), text.scale)
      : LINE_HEIGHT * text.scale
  }
}

export interface TextOptions {

  scale?: number | State<number>

  lit?: State<[number, number] | null>
  litColor?: Color | State<Color>
  shadow?: boolean
  color?: Color | State<Color>
}

export class UIText extends UIComponent {
  override name = 'UIText'
  override readonly tag = 'div'

  private readonly textState: State<string>
  private readonly scaleState: State<number>
  private readonly lit: State<[number, number] | null> | null
  private readonly litColor: State<Color> | null

  private runs: HTMLSpanElement[] | null = null
  readonly shadow: boolean

  constructor(text: string | State<string>, options: TextOptions = {}) {
    super()
    this.textState = toState(text)
    this.scaleState = toState(options.scale ?? 1)
    this.lit = options.lit ?? null
    this.litColor = options.litColor ? toState(options.litColor) : null
    this.shadow = options.shadow ?? true
    if (options.color) this.color = new ConstantColorConstraint(options.color)
    this.width = new TextSizeConstraint()
    this.height = new TextSizeConstraint()
  }

  getText(): string {
    return this.textState.get()
  }

  get scale(): number {
    return this.scaleState.get()
  }

  override paint(element: HTMLElement, scale: number): void {
    const color = this.getColor()

    const pixel = this.scale * scale
    const text = this.getText()

    setStyle(element, 'font-size', `${LINE_HEIGHT * pixel}px`)
    setStyle(element, 'color', toCss(color))
    setStyle(element, 'text-shadow', shadowFor(color, pixel, this.shadow))

    setStyle(element, 'clip-path', 'inset(-4px 0px -4px 0px)')

    if (!this.lit) {
      say(element, text)
      return
    }

    const found = this.lit.get()
    const from = found ? Math.max(0, Math.min(text.length, found[0])) : text.length
    const to = found ? Math.min(text.length, from + Math.max(0, found[1])) : text.length
    const runs = this.pieces(element)
    say(runs[0], text.slice(0, from))
    say(runs[1], text.slice(from, to))
    say(runs[2], text.slice(to))

    const lit = this.litColor?.get() ?? color
    setStyle(runs[1], 'color', toCss(lit))
    setStyle(runs[1], 'text-shadow', shadowFor(lit, pixel, this.shadow))
  }

  private pieces(element: HTMLElement): HTMLSpanElement[] {
    const held = this.runs
    if (held && held[0].parentNode === element) return held
    element.textContent = ''
    return (this.runs = [0, 0, 0].map(() => element.appendChild(document.createElement('span'))))
  }
}

export class UIWrappedText extends UIComponent {
  override name = 'UIWrappedText'

  private readonly textState: State<string>
  private wrapped: { text: string; width: number; lines: string[] } | null = null
  readonly scale: number
  readonly shadow: boolean
  readonly lineSpacing: number
  readonly centred: boolean

  constructor(
    text: string | State<string>,
    options: TextOptions & { lineSpacing?: number; centred?: boolean } = {},
  ) {
    super()
    this.textState = toState(text)
    this.scale = typeof options.scale === 'object' ? options.scale.get() : (options.scale ?? 1)
    this.centred = options.centred ?? false
    this.shadow = options.shadow ?? true
    this.lineSpacing = options.lineSpacing ?? 2
    if (options.color) this.color = new ConstantColorConstraint(options.color)
    this.height = new WrappedHeightConstraint()
  }

  getText(): string {
    return this.textState.get()
  }

  lines(): string[] {
    const text = this.getText()
    const width = this.getWidth() / this.scale
    const held = this.wrapped
    if (held && held.text === text && held.width === width) return held.lines
    const lines = splitToWidth(text, width)
    this.wrapped = { text, width, lines }
    return lines
  }

  lineHeight(): number {
    return (LINE_HEIGHT + this.lineSpacing) * this.scale
  }

  override paint(element: HTMLElement, scale: number): void {
    const color = this.getColor()
    const pixel = this.scale * scale
    const size = LINE_HEIGHT * pixel
    const step = this.lineHeight() * scale

    setStyle(element, 'font-size', `${size}px`)
    setStyle(element, 'line-height', `${step}px`)

    setStyle(element, 'margin-top', `${(size - step) / 2}px`)
    setStyle(element, 'text-align', this.centred ? 'center' : '')
    setStyle(element, 'color', toCss(color))
    setStyle(element, 'text-shadow', shadowFor(color, pixel, this.shadow))

    say(element, this.lines().join('\n'))
  }
}

class WrappedHeightConstraint extends Constraint {
  protected override size(component: UIComponent): number {
    const text = component as UIWrappedText
    return text.lines().length * text.lineHeight() - text.lineSpacing * text.scale
  }
}

export class UICircle extends UIComponent {
  override name = 'UICircle'
  override readonly isPositionCenter = true

  radius: Constraint

  constructor(radius: number | Constraint = 0, color: Color | State<Color> = TRANSPARENT) {
    super()
    this.radius = typeof radius === 'number' ? new PixelConstraint(radius) : radius
    this.color = new ConstantColorConstraint(color)
  }

  getRadius(): number {
    return this.radius.getWidth(this)
  }

  override getLeft(): number {
    return this.x.getXPosition(this) - this.getRadius()
  }
  override getTop(): number {
    return this.y.getYPosition(this) - this.getRadius()
  }
  override getWidth(): number {
    return this.getRadius() * 2
  }
  override getHeight(): number {
    return this.getRadius() * 2
  }

  override invalidate(): void {
    super.invalidate()
    this.radius.invalidate()
  }

  override paint(element: HTMLElement): void {
    setStyle(element, 'background-color', toCss(this.getColor()))
    setStyle(element, 'border-radius', '50%')
  }
}

export type GradientDirection = 'TOP_TO_BOTTOM' | 'BOTTOM_TO_TOP' | 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT'

const GRADIENT_ANGLE: Record<GradientDirection, string> = {
  TOP_TO_BOTTOM: 'to bottom',
  BOTTOM_TO_TOP: 'to top',
  LEFT_TO_RIGHT: 'to right',
  RIGHT_TO_LEFT: 'to left',
}

export class GradientComponent extends UIComponent {
  override name = 'GradientComponent'

  private readonly start: State<Color>
  private readonly end: State<Color>
  private readonly direction: State<GradientDirection>

  constructor(
    start: Color | State<Color>,
    end: Color | State<Color>,
    direction: GradientDirection | State<GradientDirection> = 'TOP_TO_BOTTOM',
  ) {
    super()
    this.start = toState(start)
    this.end = toState(end)
    this.direction = toState(direction)
  }

  override paint(element: HTMLElement): void {
    const angle = GRADIENT_ANGLE[this.direction.get()]
    setStyle(
      element,
      'background-image',
      `linear-gradient(${angle}, ${toCss(this.start.get())}, ${toCss(this.end.get())})`,
    )
  }
}
