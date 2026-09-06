import { UIComponent } from './component'
import { type Color, sameColor, shadowOf, toCss, TRANSPARENT } from './color'
import { setStyle } from './style'
import { type Axis, Constraint, ConstantColorConstraint, PixelConstraint } from './constraints'
import { type State, toState } from './state'
import { LINE_HEIGHT, bitmapFont, fontGeneration } from './font'
import { splitToWidth } from './text'

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

export interface FontSpec {
  family: string

  size: number
  weight: string
}

export const FALLBACK_FONT: FontSpec = {
  family: '"Minecraft", ui-monospace, "Cascadia Mono", "Consolas", monospace',
  size: LINE_HEIGHT,
  weight: 'normal',
}

let measureContext: CanvasRenderingContext2D | null = null

export function measureText(text: string, font: FontSpec, scale: number): number {
  const bitmap = bitmapFont()
  if (bitmap) return bitmap.measure(text) * scale

  measureContext ??= document.createElement('canvas').getContext('2d')
  if (!measureContext) return 0
  measureContext.font = `${font.weight} ${font.size * scale}px ${font.family}`
  return measureContext.measureText(text).width
}

class TextSizeConstraint extends Constraint {
  protected override size(component: UIComponent, axis: Axis): number {
    const text = component as UIText
    return axis.horizontal
      ? measureText(text.getText(), text.font, text.scale) + (text.bold ? text.scale : 0)
      : LINE_HEIGHT * text.scale
  }
}

export interface TextOptions {
  scale?: number
  shadow?: boolean
  color?: Color | State<Color>
  font?: FontSpec

  bold?: boolean
}

interface Drawn<T> {
  text: T
  color: Color
  factor: number
  width: number
  height: number
  generation: number
}

function redraw<T>(
  drawn: Drawn<T> | null,
  text: T,
  color: Color,
  factor: number,
  width: number,
  height: number,
): Drawn<T> | null {
  const generation = fontGeneration()
  if (
    drawn &&
    drawn.text === text &&
    drawn.factor === factor &&
    drawn.width === width &&
    drawn.height === height &&
    drawn.generation === generation &&
    sameColor(drawn.color, color)
  ) {
    return null
  }
  return { text, color, factor, width, height, generation }
}

export class UIText extends UIComponent {
  override name = 'UIText'
  override readonly tag = 'canvas'

  private readonly textState: State<string>
  private drawn: Drawn<string> | null = null
  readonly scale: number
  readonly shadow: boolean
  readonly font: FontSpec
  readonly bold: boolean

  constructor(text: string | State<string>, options: TextOptions = {}) {
    super()
    this.textState = toState(text)
    this.scale = options.scale ?? 1
    this.shadow = options.shadow ?? true
    this.bold = options.bold ?? false
    this.font = options.font ?? FALLBACK_FONT
    if (options.color) this.color = new ConstantColorConstraint(options.color)
    this.width = new TextSizeConstraint()
    this.height = new TextSizeConstraint()
  }

  getText(): string {
    return this.textState.get()
  }

  override paint(element: HTMLElement, scale: number): void {
    const canvas = element as HTMLCanvasElement
    const text = this.getText()
    const color = this.getColor()
    const factor = scale * (globalThis.devicePixelRatio || 1)
    const width = Math.max(1, this.getWidth())
    const height = Math.max(1, this.getHeight())

    if (!(this.drawn = redraw(this.drawn, text, color, factor, width, height))) return

    canvas.width = Math.ceil(width * factor)
    canvas.height = Math.ceil(height * factor)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(factor, 0, 0, factor, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)

    const bitmap = bitmapFont()
    if (bitmap) {
      ctx.save()
      ctx.scale(this.scale, this.scale)
      if (this.shadow) bitmap.draw(ctx, text, 1, 1, shadowOf(color))
      bitmap.draw(ctx, text, 0, 0, color)
      if (this.bold) bitmap.draw(ctx, text, 1, 0, color)
      ctx.restore()
      return
    }

    const size = this.font.size * this.scale
    ctx.font = `${this.font.weight} ${size}px ${this.font.family}`
    ctx.textBaseline = 'top'
    if (this.shadow) {
      ctx.fillStyle = toCss(shadowOf(color))
      ctx.fillText(text, this.scale, this.scale)
    }
    ctx.fillStyle = toCss(color)
    ctx.fillText(text, 0, 0)
    if (this.bold) ctx.fillText(text, this.scale, 0)
  }
}

export class UIWrappedText extends UIComponent {
  override name = 'UIWrappedText'
  override readonly tag = 'canvas'

  private readonly textState: State<string>
  private drawn: Drawn<string[]> | null = null
  private wrapped: { text: string; width: number; generation: number; lines: string[] } | null = null
  readonly scale: number
  readonly shadow: boolean
  readonly font: FontSpec
  readonly lineSpacing: number
  readonly centred: boolean

  constructor(
    text: string | State<string>,
    options: TextOptions & { lineSpacing?: number; centred?: boolean } = {},
  ) {
    super()
    this.textState = toState(text)
    this.scale = options.scale ?? 1
    this.centred = options.centred ?? false
    this.shadow = options.shadow ?? true
    this.font = options.font ?? FALLBACK_FONT
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
    const generation = fontGeneration()
    const held = this.wrapped
    if (held && held.text === text && held.width === width && held.generation === generation) {
      return held.lines
    }
    const lines = splitToWidth(text, width, (line) => measureText(line, this.font, 1))
    this.wrapped = { text, width, generation, lines }
    return lines
  }

  lineHeight(): number {
    return (LINE_HEIGHT + this.lineSpacing) * this.scale
  }

  override paint(element: HTMLElement, scale: number): void {
    const canvas = element as HTMLCanvasElement
    const color = this.getColor()
    const factor = scale * (globalThis.devicePixelRatio || 1)
    const width = Math.max(1, this.getWidth())
    const height = Math.max(1, this.getHeight())
    const lines = this.lines()

    if (!(this.drawn = redraw(this.drawn, lines, color, factor, width, height))) return

    canvas.width = Math.ceil(width * factor)
    canvas.height = Math.ceil(height * factor)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(factor, 0, 0, factor, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)

    const bitmap = bitmapFont()
    const shadow = shadowOf(color)
    const step = LINE_HEIGHT + this.lineSpacing

    ctx.save()
    ctx.scale(this.scale, this.scale)
    lines.forEach((line, index) => {
      const y = index * step
      const x = this.centred ? (width / this.scale - measureText(line, this.font, 1)) / 2 : 0
      if (bitmap) {
        if (this.shadow) bitmap.draw(ctx, line, x + 1, y + 1, shadow)
        bitmap.draw(ctx, line, x, y, color)
        return
      }
      ctx.font = `${this.font.weight} ${this.font.size}px ${this.font.family}`
      ctx.textBaseline = 'top'
      if (this.shadow) {
        ctx.fillStyle = toCss(shadow)
        ctx.fillText(line, x + 1, y + 1)
      }
      ctx.fillStyle = toCss(color)
      ctx.fillText(line, x, y)
    })
    ctx.restore()
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
