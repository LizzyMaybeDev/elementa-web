import { type ColorConstraint, Constraint, ConstantColorConstraint, PixelConstraint } from './constraints'
import { type Color, TRANSPARENT } from './color'
import type { Effect } from './effects'
import { invalidateLayout, islands } from './frame'
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
    return this.color.moving
  }

  onClick: ((event: MouseEvent) => void) | null = null

  onPress: ((event: PointerEvent) => void) | null = null

  onRightClick: ((event: MouseEvent) => void) | null = null

  cursor: string | null = null

  onDrag: ((point: { x: number; y: number; width: number; height: number }) => void) | null = null

  onDragEnd: (() => void) | null = null
  dragCursor: string | null = null
  onHover: ((hovered: boolean) => void) | null = null

  treeDirty = true

  index = 0

  culled = false

  culledBelow = false
  private bound = false

  holdsScrollBound = false

  get scrollBound(): boolean {
    return this.bound
  }

  set scrollBound(value: boolean) {
    this.bound = value
    if (value) this.markBound()
  }

  private markBound(): void {
    for (let node = this.parent; node && !node.holdsScrollBound; node = node.parent) {
      node.holdsScrollBound = true
    }
  }

  sealed = false

  lazy: (() => void) | null = null

  private touched(): void {
    for (let node: UIComponent | null = this; node && !node.treeDirty; node = node.parent) {
      node.treeDirty = true
    }
  }

  private settle(): void {
    for (let node: UIComponent | null = this.parent ?? this; node; node = node.parent) {
      if (node.sealed) {
        islands.add(node)
        return
      }
    }
    invalidateLayout()
  }

  constrain(constraints: Constraints): this {
    Object.assign(this, constraints)
    this.settle()
    return this
  }

  setColor(value: Color | State<Color>): this {
    this.color = new ConstantColorConstraint(value)
    this.settle()
    return this
  }

  onDispose(disposer: () => void): this {
    this.disposers.push(disposer)
    return this
  }

  disposed = false

  dispose(): void {
    this.disposed = true
    for (const child of this.children) child.dispose()
    for (const disposer of this.disposers) disposer()
    this.disposers.length = 0
  }

  effect(effect: Effect): this {
    this.effects.push(effect)

    if (this.sealed) islands.add(this)
    else this.settle()
    return this
  }

  addChild(child: UIComponent): this {
    child.parent = this
    child.index = this.children.length
    this.children.push(child)
    this.touched()
    child.settle()
    return this
  }

  addChildren(...children: UIComponent[]): this {
    for (const child of children) this.addChild(child)
    return this
  }

  childOf(parent: UIComponent): this {
    parent.addChild(this)

    if (this.bound || this.holdsScrollBound) this.markBound()
    return this
  }

  detach(): this {
    const parent = this.parent
    if (parent) {
      parent.children.splice(this.index, 1)
      for (let n = this.index; n < parent.children.length; n++) parent.children[n].index = n
      parent.touched()
      this.settle()
      this.parent = null
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
    for (let node: UIComponent | null = this; node; node = node.parent) {
      if (node.sealed) {
        islands.add(node)
        return this
      }
    }
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

  released = false

  release(): void {}

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
