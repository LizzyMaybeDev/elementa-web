import { UIComponent, Window } from './component'
import { setScaleFactor } from './constraints'
import { leaving, measureScrollers, moving, passDone, rehome, scrollMetrics, shine } from './effects'
import { building, invalidateScroll, islands, passOwed, rousedNow, setReading } from './frame'
import { setStyle } from './style'
import { touch } from './device'

interface Clip {
  left: number
  top: number
  right: number
  bottom: number
}

const MARGIN = 200
const AHEAD = 900

const stirring = (component: UIComponent): boolean => {
  for (const node of component.walk()) {
    const element = node.element
    if (element && (moving(element) || leaving(element))) return true
  }
  return false
}
const BUDGET = 8

export interface RendererOptions {
  scale?: number

  autoScale?: boolean

  minLogicalWidth?: number
  minLogicalHeight?: number

  minScale?: number

  debug?: boolean

  compactBelow?: number

  compactLogicalWidth?: number
}

export function autoGuiScale(
  width: number,
  height: number,
  minWidth: number,
  minHeight: number,
  max = 4,
): number {
  let scale = 1
  while (scale < max && width / (scale + 1) >= minWidth && height / (scale + 1) >= minHeight) {
    scale += 1
  }
  return scale
}

let measuredScrollbar: number | null = null

export function thinScrollbarWidth(): number {
  if (measuredScrollbar !== null) return measuredScrollbar
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;top:-9999px;visibility:hidden;overflow-y:scroll;scrollbar-width:thin;width:100px;height:100px'
  document.body.appendChild(probe)
  measuredScrollbar = probe.offsetWidth - probe.clientWidth
  probe.remove()
  return measuredScrollbar
}

export class DomRenderer {
  private readonly elements = new WeakMap<UIComponent, HTMLElement>()

  private readonly managed = new WeakSet<HTMLElement>()
  private readonly owners = new WeakMap<HTMLElement, UIComponent>()
  private hovered: UIComponent[] = []
  private size: { width: number; height: number }
  private readonly placed = new WeakMap<UIComponent, Float64Array>()
  private frame = 0
  private running = false
  private deadline = Infinity
  private margin = MARGIN
  private readonly clips = new WeakMap<UIComponent, Clip>()
  private warmable = true
  private created = 0

  private live: UIComponent[] = []

  scale: number
  debug: boolean

  onFrame: (() => void) | null = null

  autoScale: boolean

  compact = false
  compactZoom = 1
  private readonly compactBelow: number
  private readonly compactLogicalWidth: number
  private readonly minLogicalWidth: number
  private readonly minLogicalHeight: number
  private readonly minScale: number

  constructor(
    private readonly window_: Window,
    private readonly host: HTMLElement,
    options: RendererOptions = {},
  ) {
    this.scale = options.scale ?? 1
    this.debug = options.debug ?? false
    this.autoScale = options.autoScale ?? false

    this.minLogicalWidth = options.minLogicalWidth ?? 420
    this.minLogicalHeight = options.minLogicalHeight ?? 280
    this.minScale = options.minScale ?? 2
    this.compactBelow = options.compactBelow ?? 700
    this.compactLogicalWidth = options.compactLogicalWidth ?? 200

    host.style.position = 'relative'
    host.style.overflow = 'hidden'
    const rect = host.getBoundingClientRect()
    this.size = { width: rect.width, height: rect.height }
    this.compact = rect.width < this.compactBelow

    host.addEventListener('scroll', invalidateScroll, { capture: true, passive: true })
    this.delegate()
  }

  private delegate(): void {
    const host = this.host
    const words = (): string => globalThis.getSelection?.()?.toString() ?? ''
    let picked = ''
    const owner = (target: EventTarget | null): UIComponent | null => {
      for (let node = target as HTMLElement | null; node && node !== host; node = node.parentElement) {
        const held = this.owners.get(node)
        if (held) return held
      }
      return null
    }

    host.addEventListener('click', (event) => {
      if (words() && words() !== picked) return
      for (let held = owner(event.target); held; held = held.parent) {
        if (!held.onClick) continue
        held.onClick(event)
        return
      }
    })

    host.addEventListener('contextmenu', (event) => {
      for (let held = owner(event.target); held; held = held.parent) {
        if (!held.onRightClick) continue
        event.preventDefault()
        held.onRightClick(event)
        return
      }
    })

    host.addEventListener('pointerdown', (event) => {
      picked = words()

      for (let told = owner(event.target); told; told = told.parent) {
        if (!told.onPress) continue
        told.onPress(event)
        break
      }

      let held = owner(event.target)
      while (held && !held.onDrag) held = held.parent
      const element = held?.element
      if (!held || !element) return
      event.preventDefault()
      element.setPointerCapture(event.pointerId)

      const emit = (e: PointerEvent): void => {
        const box = element.getBoundingClientRect()
        held.onDrag?.({
          x: (e.clientX - box.left) / this.scale,
          y: (e.clientY - box.top) / this.scale,
          width: box.width / this.scale,
          height: box.height / this.scale,
        })
      }
      const release = (e: PointerEvent): void => {
        element.releasePointerCapture(e.pointerId)
        element.removeEventListener('pointermove', emit)
        element.removeEventListener('pointerup', release)
        element.removeEventListener('pointercancel', release)
        held.onDragEnd?.()
      }
      element.addEventListener('pointermove', emit)
      element.addEventListener('pointerup', release)
      element.addEventListener('pointercancel', release)
      emit(event)
    })

    const hover = (target: EventTarget | null): void => {
      const now: UIComponent[] = []
      for (let held = owner(target); held; held = held.parent) if (held.onHover) now.push(held)
      const was = this.hovered
      this.hovered = now
      for (const left of was) if (!now.includes(left)) left.onHover?.(false)
      for (const entered of now) if (!was.includes(entered)) entered.onHover?.(true)
    }
    if (touch) return
    let lastX = NaN
    let lastY = NaN
    host.addEventListener('pointerover', (event) => {
      if (event.clientX === lastX && event.clientY === lastY) return
      lastX = event.clientX
      lastY = event.clientY
      hover(event.target)
    })
    host.addEventListener('pointerleave', () => hover(null))
  }

  render(): void {
    measureScrollers()
    const rect = this.size

    this.compact = rect.width < this.compactBelow
    if (this.compact && this.autoScale) {
      const ratio = globalThis.devicePixelRatio || 1
      const fit = Math.max(1, Math.floor((rect.width * ratio) / this.compactLogicalWidth)) / ratio
      this.scale = fit * this.compactZoom
    } else if (this.autoScale) {
      this.scale = Math.max(
        this.minScale,
        autoGuiScale(rect.width, rect.height, this.minLogicalWidth, this.minLogicalHeight),
      )
    }

    setScaleFactor(this.scale * (globalThis.devicePixelRatio || 1))
    this.window_.setViewport(rect.width / this.scale, rect.height / this.scale)

    this.window_.invalidate()

    this.live = []
    this.deadline = performance.now() + BUDGET
    this.position(this.window_, null, this.whole(), false)
    passDone()
    this.warmable = true
    this.onFrame?.()
  }

  scrolled(): void {
    measureScrollers()
    this.deadline = performance.now() + BUDGET
    this.position(this.window_, null, this.whole(), true)
    passDone()
    this.warmable = true
    this.onFrame?.()
  }

  private warm(): void {
    if (!this.warmable) return
    const before = this.created
    this.margin = AHEAD
    this.deadline = performance.now() + BUDGET / 2
    try {
      this.position(this.window_, null, this.whole(), true)
    } finally {
      this.margin = MARGIN
    }
    if (this.created === before) this.warmable = false
  }

  private whole(): Clip {
    return { left: 0, top: 0, right: this.window_.getWidth(), bottom: this.window_.getHeight() }
  }

  private ensure(component: UIComponent, hostElement: HTMLElement): HTMLElement {
    let element = this.elements.get(component)
    if (!element) {
      element = document.createElement(component.tag)
      element.dataset.component = component.name
      element.style.position = 'absolute'
      element.style.margin = '0'
      element.style.padding = '0'
      this.managed.add(element)
      this.elements.set(component, element)
      this.owners.set(element, component)
      component.element = element
      hostElement.appendChild(element)
      this.created++
    } else if (element.parentElement !== hostElement) {
      hostElement.appendChild(element)
      rehome(element)
    }
    return element
  }

  private tidy(component: UIComponent, element: HTMLElement): void {
    component.treeDirty = false
    const wanted = new Set<HTMLElement>()
    for (const child of component.children) {
      const held = this.elements.get(child)
      if (held) wanted.add(held)
    }
    for (const existing of Array.from(element.children)) {
      const child = existing as HTMLElement
      if (!this.managed.has(child) || wanted.has(child)) continue
      if (child.classList.contains('going')) continue
      element.removeChild(child)
    }
  }

  private position(
    component: UIComponent,
    parent: UIComponent | null,
    clip: Clip,
    scrolling: boolean,
  ): void {
    const home = parent ? parent.element : this.host
    if (!home) return
    setReading(component)
    let made = !this.elements.has(component)
    const element = this.ensure(component, home)

    if (component.lazy) {
      component.culledBelow = false
      if (this.outside(component, clip)) {
        component.culled = true
        return
      }
      if (performance.now() > this.deadline) {
        component.culled = true
        invalidateScroll()
        return
      }
      const build = component.lazy
      component.lazy = null
      building(build)
      scrolling = false
      made = true
    }

    if (scrolling) {
      const tracks = component.scrollBound || component.effects.some((effect) => effect.scrolls)
      if (tracks) component.invalidate()
      else if (component.holdsScrollBound) {
        this.descend(component, element, clip, true, false)
        return
      } else if (!component.culled && !component.culledBelow) return
      else {
        this.descend(component, element, clip, true, false)
        return
      }
    }

    const left = component.getLeft()
    const top = component.getTop()
    const width = component.getWidth()
    const height = component.getHeight()

    const scale = this.scale
    const l = (parent ? left - parent.getLeft() : left) * scale
    const t = (parent ? top - parent.getTop() : top) * scale
    const w = width * scale
    const h = height * scale

    let box = this.placed.get(component)
    if (!box) {
      box = new Float64Array(4).fill(NaN)
      this.placed.set(component, box)
    }
    if (box[0] !== l) setStyle(element, 'left', `${(box[0] = l)}px`)
    if (box[1] !== t) setStyle(element, 'top', `${(box[1] = t)}px`)
    if (box[2] !== w) setStyle(element, 'width', `${(box[2] = w)}px`)
    if (box[3] !== h) setStyle(element, 'height', `${(box[3] = h)}px`)

    const cursor =
      component.cursor ??
      (component.onDrag
        ? (component.dragCursor ?? 'ew-resize')
        : component.onClick
          ? 'pointer'
          : '')
    setStyle(element, 'cursor', cursor)
    setStyle(element, 'touch-action', component.onDrag ? 'none' : '')

    if (component.live) this.live.push(component)
    component.paint(element, this.scale)
    for (const effect of component.effects) effect.apply(element, component, this.scale)

    if (this.debug) {
      setStyle(element, 'outline', '1px solid rgba(255, 0, 128, 0.35)')
      setStyle(element, 'outline-offset', '-1px')
    }

    if (component.sealed) this.clips.set(component, clip)
    this.descend(component, element, clip, scrolling, made)
    if (component.sealed) islands.delete(component)
    setReading(parent)
  }

  private settle(): void {
    if (islands.size === 0) return
    this.deadline = performance.now() + BUDGET
    for (const held of islands) {
      islands.delete(held)
      this.alone(held as UIComponent)
    }
  }

  private alone(island: UIComponent): void {
    const clip = this.clips.get(island)
    const home = island.parent?.element
    if (!clip || !home || island.element?.parentElement !== home) return
    island.invalidate()
    this.position(island, island.parent, clip, false)
  }

  private rouse(): void {
    this.deadline = performance.now() + BUDGET
    for (const held of rousedNow(performance.now())) this.alone(held as UIComponent)
  }

  private outside(component: UIComponent, clip: Clip, margin = this.margin): boolean {
    const left = component.getLeft()
    const top = component.getTop()
    return (
      left + component.getWidth() < clip.left - margin ||
      top + component.getHeight() < clip.top - margin ||
      left > clip.right + margin ||
      top > clip.bottom + margin
    )
  }

  private descend(
    component: UIComponent,
    element: HTMLElement,
    clip: Clip,
    scrolling: boolean,
    made: boolean,
  ): void {
    if (component.children.length === 0) {
      if (component.treeDirty) this.tidy(component, element)
      return
    }

    if (made && performance.now() > this.deadline) {
      component.culled = true
      component.culledBelow = false
      invalidateScroll()
      return
    }

    const out = this.outside(component, clip)
    const fresh = component.culled && !out
    const wasIn = !component.culled && !made
    component.culled = out
    if (out) {
      component.culledBelow = false
      if (wasIn) for (const child of component.children) this.position(child, component, clip, scrolling)
      if (!component.released && this.outside(component, clip, AHEAD) && !stirring(component)) {
        component.released = true
        for (const node of component.walk()) node.release()
      }
      return
    }
    component.released = false

    let inner = clip
    for (const effect of component.effects) {
      if (!effect.clips) continue
      const shift = scrollMetrics(element).top / this.scale
      const left = component.getLeft()
      const top = component.getTop()
      inner = {
        left: Math.max(clip.left, left),
        top: Math.max(clip.top, top) + shift,
        right: Math.min(clip.right, left + component.getWidth()),
        bottom: Math.min(clip.bottom, top + component.getHeight()) + shift,
      }
      break
    }

    const partial = scrolling && !fresh
    let below = false
    for (const child of component.children) {
      this.position(child, component, inner, partial)
      if (child.culled || child.culledBelow) below = true
    }
    component.culledBelow = below
    if (component.treeDirty) this.tidy(component, element)
  }

  start(): void {
    if (this.running) return
    this.running = true
    let reported = ''
    const loop = () => {
      if (!this.running) return
      try {
        shine()
        const pass = passOwed(performance.now())
        if (pass === 'layout') this.render()
        else if (pass === 'scroll') this.scrolled()
        else if (pass === 'islands') {
          this.rouse()
          this.settle()
          this.paintLive()
        } else {
          this.settle()
          this.paintLive()
          this.warm()
        }
      } catch (error) {
        const message = (error as Error).message
        if (message !== reported) {
          reported = message
          console.error('[render]', message)
        }
      }
      this.frame = requestAnimationFrame(loop)
    }
    loop()
  }

  private paintLive(): void {
    for (const component of this.live) {
      const element = this.elements.get(component)
      if (element) component.paint(element, this.scale)
    }
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  observeResize(): () => void {
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) this.size = { width: box.width, height: box.height }
      this.render()
    })
    observer.observe(this.host)

    let query: MediaQueryList | null = null
    const watchRatio = (): void => {
      query?.removeEventListener('change', onRatioChange)
      query = matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`)
      query.addEventListener('change', onRatioChange)
    }
    const onRatioChange = (): void => {
      this.render()
      watchRatio()
    }
    watchRatio()

    return () => {
      observer.disconnect()
      query?.removeEventListener('change', onRatioChange)
    }
  }
}
