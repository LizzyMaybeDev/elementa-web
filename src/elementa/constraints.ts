import type { UIComponent } from './component'
import { type State, toState } from './state'
import type { Color } from './color'

let scaleFactor = 1

export const setScaleFactor = (factor: number): void => {
  scaleFactor = factor
}

export function roundToRealPixels(value: number): number {
  const rounded = Math.round(value * scaleFactor)

  return (rounded === 0 && Math.abs(value) > 0.001 ? Math.sign(value) : rounded) / scaleFactor
}

export interface Axis {
  readonly horizontal: boolean
  start(component: UIComponent): number
  end(component: UIComponent): number
  size(component: UIComponent): number

  padding(component: UIComponent): number
  positionOf(constraint: Constraint, component: UIComponent): number
  sizeOf(constraint: Constraint, component: UIComponent): number
}

interface PaddingSource {
  getPadding(component: UIComponent, axis: Axis): number
}

function paddingOf(constraint: unknown, component: UIComponent, axis: Axis): number {
  const source = constraint as Partial<PaddingSource>
  return typeof source?.getPadding === 'function' ? source.getPadding(component, axis) : 0
}

export const X: Axis = {
  horizontal: true,
  start: (c) => c.getLeft(),
  end: (c) => c.getRight(),
  size: (c) => c.getWidth(),
  padding: (c) => paddingOf(c.x, c, X),
  positionOf: (k, c) => k.getXPosition(c),
  sizeOf: (k, c) => k.getWidth(c),
}

export const Y: Axis = {
  horizontal: false,
  start: (c) => c.getTop(),
  end: (c) => c.getBottom(),
  size: (c) => c.getHeight(),
  padding: (c) => paddingOf(c.y, c, Y),
  positionOf: (k, c) => k.getYPosition(c),
  sizeOf: (k, c) => k.getHeight(c),
}

export abstract class Constraint {
  cachedValue = 0
  recalculate = true
  constrainTo: UIComponent | null = null

  protected target(component: UIComponent): UIComponent {
    return this.constrainTo ?? component.parent ?? component
  }

  protected position(_component: UIComponent, _axis: Axis): number {
    throw new Error(`${this.constructor.name} cannot be used as a position`)
  }

  protected size(_component: UIComponent, _axis: Axis): number {
    throw new Error(`${this.constructor.name} cannot be used as a size`)
  }

  private resolving = false

  private resolve(component: UIComponent, axis: Axis, impl: 'position' | 'size'): number {
    if (this.recalculate) {
      if (this.resolving) {
        throw new Error(
          `constraint cycle: ${this.constructor.name} resolving the ` +
            `${impl === 'size' ? (axis.horizontal ? 'width' : 'height') : axis.horizontal ? 'x' : 'y'} ` +
            `of ${component.name} depends on itself`,
        )
      }
      this.resolving = true
      try {
        this.cachedValue = roundToRealPixels(this[impl](component, axis))
      } finally {
        this.resolving = false
      }
      this.recalculate = false
    }
    return this.cachedValue
  }

  getXPosition(component: UIComponent): number {
    return this.resolve(component, X, 'position')
  }
  getYPosition(component: UIComponent): number {
    return this.resolve(component, Y, 'position')
  }
  getWidth(component: UIComponent): number {
    return this.resolve(component, X, 'size')
  }
  getHeight(component: UIComponent): number {
    return this.resolve(component, Y, 'size')
  }

  invalidate(): void {
    this.recalculate = true
  }

  to(component: UIComponent): this {
    this.constrainTo = component
    return this
  }
}

function furthestTrailingEdge(axis: Axis, parent: UIComponent, index: number): number {
  const sibling = parent.children[index - 1]
  let furthest = axis.end(sibling)
  for (let n = index - 1; n >= 0; n--) {
    const child = parent.children[n]
    if (axis.start(child) !== axis.start(sibling)) break
    furthest = Math.max(furthest, axis.end(child))
  }
  return furthest
}

function furthestLeadingEdge(axis: Axis, parent: UIComponent, index: number): number {
  const sibling = parent.children[index - 1]
  let furthest = axis.start(sibling)
  for (let n = index - 1; n >= 0; n--) {
    const child = parent.children[n]
    if (axis.end(child) !== axis.end(sibling)) break
    furthest = Math.min(furthest, axis.start(child))
  }
  return furthest
}

export class PixelConstraint extends Constraint {
  private readonly value: State<number>
  private readonly alignOpposite: State<boolean>
  private readonly alignOutside: State<boolean>

  constructor(
    value: number | State<number>,
    alignOpposite: boolean | State<boolean> = false,
    alignOutside: boolean | State<boolean> = false,
  ) {
    super()
    this.value = toState(value)
    this.alignOpposite = toState(alignOpposite)
    this.alignOutside = toState(alignOutside)
  }

  protected override position(component: UIComponent, axis: Axis): number {
    const target = this.target(component)
    const value = this.value.get()
    const outside = this.alignOutside.get()
    return this.alignOpposite.get()
      ? outside
        ? axis.end(target) + value
        : axis.end(target) - value - axis.size(component)
      : outside
        ? axis.start(target) - axis.size(component) - value
        : axis.start(target) + value
  }

  protected override size(): number {
    return this.value.get()
  }
}

export class RelativeConstraint extends Constraint {
  private readonly value: State<number>

  constructor(value: number | State<number> = 1) {
    super()
    this.value = toState(value)
  }

  protected override position(component: UIComponent, axis: Axis): number {
    return axis.start(this.target(component)) + this.size(component, axis)
  }

  protected override size(component: UIComponent, axis: Axis): number {
    return axis.size(this.target(component)) * this.value.get()
  }
}

export class CenterConstraint extends Constraint {
  protected override position(component: UIComponent, axis: Axis): number {
    const parent = this.target(component)
    const half = component.isPositionCenter
      ? axis.size(parent) / 2
      : axis.size(parent) / 2 - axis.size(component) / 2
    return axis.start(parent) + roundToRealPixels(half)
  }
}

export class SiblingConstraint extends Constraint implements PaddingSource {
  constructor(
    readonly padding = 0,
    readonly alignOpposite = false,
  ) {
    super()
  }

  getPadding(component: UIComponent): number {
    const first = component.parent !== null && component.index === 0
    return first && !this.constrainTo ? 0 : this.padding
  }

  protected override position(component: UIComponent, axis: Axis): number {
    const anchor = this.constrainTo
    if (anchor) {
      return this.alignOpposite
        ? axis.start(anchor) - axis.size(component) - this.padding
        : axis.end(anchor) + this.padding
    }

    const parent = component.parent
    if (!parent) return 0
    const index = component.index

    if (this.alignOpposite) {
      if (index <= 0) return axis.end(parent) - axis.size(component)
      return furthestLeadingEdge(axis, parent, index) - axis.size(component) - this.padding
    }
    if (index <= 0) return axis.start(parent)
    return furthestTrailingEdge(axis, parent, index) + this.padding
  }
}

export class CramSiblingConstraint extends Constraint implements PaddingSource {
  private static readonly PRECISION = 0.01

  constructor(readonly padding = 0) {
    super()
  }

  private fitsBeside(
    component: UIComponent,
    parent: UIComponent,
    previous: UIComponent,
  ): boolean {
    return (
      previous.getRight() + component.getWidth() + this.padding <=
      parent.getRight() + CramSiblingConstraint.PRECISION
    )
  }

  protected override position(component: UIComponent, axis: Axis): number {
    const parent = component.parent
    if (!parent) return 0
    const index = component.index
    if (index <= 0) return axis.start(parent)

    const previous = parent.children[index - 1]
    const fits = this.fitsBeside(component, parent, previous)

    if (axis.horizontal) return fits ? previous.getRight() + this.padding : parent.getLeft()
    return fits ? previous.getTop() : furthestTrailingEdge(Y, parent, index) + this.padding
  }

  getPadding(component: UIComponent, axis: Axis): number {
    const parent = component.parent
    const index = component.index
    if (!parent || index <= 0) return 0
    const fits = this.fitsBeside(component, parent, parent.children[index - 1])
    return fits === axis.horizontal ? this.padding : 0
  }
}

export class ChildBasedSizeConstraint extends Constraint {
  constructor(readonly padding = 0) {
    super()
  }

  protected override size(component: UIComponent, axis: Axis): number {
    const children = (this.constrainTo ?? component).children
    if (children.length === 0) return 0
    let total = (children.length - 1) * this.padding
    for (const child of children) total += axis.size(child) + axis.padding(child)
    return total
  }
}

export class ChildBasedMaxSizeConstraint extends Constraint {
  protected override size(component: UIComponent, axis: Axis): number {
    const children = (this.constrainTo ?? component).children
    let largest: UIComponent | null = null
    let best = -Infinity
    for (const child of children) {
      const measured = axis.size(child) + axis.padding(child)
      if (measured > best) {
        best = measured
        largest = child
      }
    }
    return largest ? axis.size(largest) : 0
  }
}

export class ChildBasedRangeConstraint extends Constraint {
  protected override size(component: UIComponent, axis: Axis): number {
    const children = (this.constrainTo ?? component).children
    if (children.length === 0) return 0
    let low = Infinity
    let high = -Infinity
    for (const child of children) {
      low = Math.min(low, axis.start(child))
      high = Math.max(high, axis.end(child))
    }
    return Math.max(0, high - low)
  }
}

export class FillConstraint extends Constraint {
  constructor(readonly useSiblings = true) {
    super()
  }

  protected override size(component: UIComponent, axis: Axis): number {
    const target = this.target(component)
    if (!this.useSiblings) return axis.end(target) - axis.start(component)
    const taken = target.children.reduce(
      (sum, child) => (child === component ? sum : sum + axis.size(child)),
      0,
    )
    return axis.size(target) - taken
  }
}

export class AspectConstraint extends Constraint {
  constructor(readonly value = 1) {
    super()
  }

  protected override size(component: UIComponent, axis: Axis): number {
    return axis.horizontal ? component.getHeight() * this.value : component.getWidth() / this.value
  }
}

export class CombinedConstraint extends Constraint {
  constructor(
    private readonly left: Constraint,
    private readonly right: Constraint,
    private readonly operator: (a: number, b: number) => number,
  ) {
    super()
  }

  protected override position(component: UIComponent, axis: Axis): number {
    return this.operator(
      axis.positionOf(this.left, component),
      axis.positionOf(this.right, component),
    )
  }

  protected override size(component: UIComponent, axis: Axis): number {
    return this.operator(axis.sizeOf(this.left, component), axis.sizeOf(this.right, component))
  }

  override invalidate(): void {
    super.invalidate()
    this.left.invalidate()
    this.right.invalidate()
  }
}

export class ScaledConstraint extends Constraint {
  private readonly factor: State<number>

  constructor(
    private readonly inner: Constraint,
    factor: number | State<number>,
  ) {
    super()
    this.factor = toState(factor)
  }

  protected override position(component: UIComponent, axis: Axis): number {
    return axis.positionOf(this.inner, component) * this.factor.get()
  }

  protected override size(component: UIComponent, axis: Axis): number {
    return axis.sizeOf(this.inner, component) * this.factor.get()
  }

  override invalidate(): void {
    super.invalidate()
    this.inner.invalidate()
  }
}

export class BasicConstraint extends Constraint {
  constructor(private readonly compute: (component: UIComponent, axis: Axis) => number) {
    super()
  }

  protected override position(component: UIComponent, axis: Axis): number {
    return this.compute(component, axis)
  }

  protected override size(component: UIComponent, axis: Axis): number {
    return this.compute(component, axis)
  }
}

export interface ColorConstraint {
  cachedValue: Color
  recalculate: boolean
  readonly moving: boolean
  getColor(component: UIComponent): Color
  invalidate(): void
}

export class ConstantColorConstraint implements ColorConstraint {
  cachedValue: Color
  recalculate = true
  private readonly value: State<Color>

  constructor(
    value: Color | State<Color>,

    readonly moving = false,
  ) {
    this.value = toState(value)
    this.cachedValue = this.value.get()
  }

  invalidate(): void {
    this.recalculate = true
  }

  getColor(): Color {
    if (this.recalculate || this.moving) {
      this.cachedValue = this.value.get()
      this.recalculate = false
    }
    return this.cachedValue
  }
}

export const pixels = (v: number | State<number>, opposite = false, outside = false) =>
  new PixelConstraint(v, opposite, outside)
export const percent = (v: number | State<number>) => new RelativeConstraint(v)
export const center = () => new CenterConstraint()
export const sibling = (padding = 0, alignOpposite = false) =>
  new SiblingConstraint(padding, alignOpposite)
export const cram = (padding = 0) => new CramSiblingConstraint(padding)
export const childBasedSize = (padding = 0) => new ChildBasedSizeConstraint(padding)
export const childBasedMaxSize = () => new ChildBasedMaxSizeConstraint()
export const childBasedRange = () => new ChildBasedRangeConstraint()
export const fill = (useSiblings = true) => new FillConstraint(useSiblings)
export const aspect = (ratio: number) => new AspectConstraint(ratio)
export const basic = (fn: (component: UIComponent, axis: Axis) => number) => new BasicConstraint(fn)
export const colorOf = (v: Color | State<Color>) => new ConstantColorConstraint(v)

export const scaled = (inner: Constraint, factor: number | State<number>) =>
  new ScaledConstraint(inner, factor)

export const plus = (a: Constraint, b: Constraint) => new CombinedConstraint(a, b, (x, y) => x + y)
export const minus = (a: Constraint, b: Constraint) => new CombinedConstraint(a, b, (x, y) => x - y)
export const atLeast = (a: Constraint, b: Constraint) =>
  new CombinedConstraint(a, b, (x, y) => Math.max(x, y))
export const atMost = (a: Constraint, b: Constraint) =>
  new CombinedConstraint(a, b, (x, y) => Math.min(x, y))
