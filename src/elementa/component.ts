import { type ColorConstraint, Constraint, ConstantColorConstraint, PixelConstraint } from './constraints'
import { type Color, TRANSPARENT } from './color'
import type { Effect } from './effects'
import { invalidateLayout } from './frame'
import { BasicState, type State } from './state'

export interface Constraints {
  x?: Constraint
  y?: Constraint
  width?: Constraint
  height?: Constraint
  color?: ColorConstraint
}

export interface Bounds {
  left: number
  top: number
  width: number
  height: number
}

export class UIComponent {
  parent: UIComponent | null = null
  readonly children: UIComponent[] = []

  name = 'UIComponent'

  readonly isPositionCenter: boolean = false

  readonly tag: string = 'div'

  x: Constraint = new PixelConstraint(0)
  y: Constraint = new PixelConstraint(0)
  width: Constraint = new PixelConstraint(0)
  height: Constraint = new PixelConstraint(0)
  color: ColorConstraint = new ConstantColorConstraint(TRANSPARENT)

  readonly effects: Effect[] = []

  private readonly disposers: (() => void)[] = []

  element: HTMLElement | null = null

  get live(): boolean {
    return false
  }

  onClick: ((event: MouseEvent) => void) | null = null

  onDrag: ((point: { x: number; y: number; width: number; height: number }) => void) | null = null
  dragCursor: string | null = null
  onHover: ((hovered: boolean) => void) | null = null

  treeDirty = true

  index = 0

  private touched(): void {
    for (let node: UIComponent | null = this; node && !node.treeDirty; node = node.parent) {
      node.treeDirty = true
    }
  }

  constrain(constraints: Constraints): this {
    Object.assign(this, constraints)
    invalidateLayout()
    return this
  }

  setColor(value: Color | State<Color>): this {
    this.color = new ConstantColorConstraint(value)
    invalidateLayout()
    return this
  }

  onDispose(disposer: () => void): this {
    this.disposers.push(disposer)
    return this
  }

  dispose(): void {
    for (const child of this.children) child.dispose()
    for (const disposer of this.disposers) disposer()
    this.disposers.length = 0
  }

  effect(effect: Effect): this {
    this.effects.push(effect)
    invalidateLayout()
    return this
  }

  addChild(child: UIComponent): this {
    child.parent = this
    child.index = this.children.length
    this.children.push(child)
    this.touched()
    invalidateLayout()
    return this
  }

  addChildren(...children: UIComponent[]): this {
    for (const child of children) this.addChild(child)
    return this
  }

  childOf(parent: UIComponent): this {
    parent.addChild(this)
    return this
  }

  detach(): this {
    const parent = this.parent
    if (parent) {
      parent.children.splice(this.index, 1)
      for (let n = this.index; n < parent.children.length; n++) parent.children[n].index = n
      parent.touched()
      this.parent = null
      invalidateLayout()
    }
    return this
  }

  removeChild(child: UIComponent): this {
    if (child.parent === this) {
      child.detach()
      child.dispose()
    }
    return this
  }

  clearChildren(dispose = true): this {
    for (const child of this.children) {
      child.parent = null
      if (dispose) child.dispose()
    }
    this.children.length = 0
    this.touched()
    invalidateLayout()
    return this
  }

  getLeft(): number {
    return this.x.getXPosition(this)
  }
  getTop(): number {
    return this.y.getYPosition(this)
  }
  getWidth(): number {
    return this.width.getWidth(this)
  }
  getHeight(): number {
    return this.height.getHeight(this)
  }
  getRight(): number {
    return this.getLeft() + this.getWidth()
  }
  getBottom(): number {
    return this.getTop() + this.getHeight()
  }
  getColor(): Color {
    return this.color.getColor(this)
  }

  getBounds(): Bounds {
    return {
      left: this.getLeft(),
      top: this.getTop(),
      width: this.getWidth(),
      height: this.getHeight(),
    }
  }

  invalidate(): void {
    this.x.invalidate()
    this.y.invalidate()
    this.width.invalidate()
    this.height.invalidate()
    this.color.invalidate()
    for (const effect of this.effects) effect.invalidate()
    for (const child of this.children) child.invalidate()
  }

  *walk(): Generator<UIComponent> {
    yield this
    for (const child of this.children) yield* child.walk()
  }

  paint(element: HTMLElement, _scale: number): void {
    element.style.backgroundColor = 'transparent'
  }
}

export class Window extends UIComponent {
  private viewportWidth = 0
  private viewportHeight = 0

  constructor() {
    super()
    this.name = 'Window'
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = width
    this.viewportHeight = height
  }

  override getLeft(): number {
    return 0
  }
  override getTop(): number {
    return 0
  }
  override getWidth(): number {
    return this.viewportWidth
  }
  override getHeight(): number {
    return this.viewportHeight
  }
}

export function hoverState(component: UIComponent): BasicState<boolean> {
  const hovered = new BasicState(false)
  component.onHover = hovered.set
  return hovered
}
