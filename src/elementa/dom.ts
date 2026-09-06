import { UIComponent, Window } from './component'
import { setScaleFactor } from './constraints'
import { measureScrollers, rehome, scrollMetrics } from './effects'
import { invalidateLayout, layoutOwed } from './frame'
import { setStyle } from './style'

interface Clip {
  left: number
  top: number
  right: number
  bottom: number
}

const MARGIN = 200

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

  private live: UIComponent[] = []

  scale: number
  debug: boolean

  onFrame: (() => void) | null = null

  autoScale: boolean

  compact = false
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

    host.addEventListener('scroll', invalidateLayout, { capture: true, passive: true })
    this.delegate()
  }

  private delegate(): void {
    const host = this.host
    const owner = (target: EventTarget | null): UIComponent | null => {
      for (let node = target as HTMLElement | null; node && node !== host; node = node.parentElement) {
        const held = this.owners.get(node)
        if (held) return held
      }
      return null
    }

    host.addEventListener('click', (event) => {
      for (let held = owner(event.target); held; held = held.parent) {
        if (!held.onClick) continue
        held.onClick(event)
        return
      }
    })

    host.addEventListener('pointerdown', (event) => {
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
    if (this.compact) {
      const ratio = globalThis.devicePixelRatio || 1
      this.scale = Math.max(1, Math.floor((rect.width * ratio) / this.compactLogicalWidth)) / ratio
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
    this.sync(this.window_, this.host)
    this.position(this.window_, null, {
      left: 0,
      top: 0,
      right: this.window_.getWidth(),
      bottom: this.window_.getHeight(),
    })
    this.onFrame?.()
  }

  private sync(component: UIComponent, hostElement: HTMLElement): void {
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
    } else if (element.parentElement !== hostElement) {
      hostElement.appendChild(element)
      rehome(element)
    }

    if (!component.treeDirty) return
    component.treeDirty = false

    const wanted = new Set<HTMLElement>()
    for (const child of component.children) {
      this.sync(child, element)
      const childElement = this.elements.get(child)
      if (childElement) wanted.add(childElement)
    }

    for (const existing of Array.from(element.children)) {
      const child = existing as HTMLElement
      if (!this.managed.has(child) || wanted.has(child)) continue
      if (child.classList.contains('fading') || child.classList.contains('leaving')) continue
      element.removeChild(child)
    }
  }

  private position(component: UIComponent, parent: UIComponent | null, clip: Clip): void {
    const element = this.elements.get(component)
    if (!element) return

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

    const cursor = component.onDrag
      ? (component.dragCursor ?? 'ew-resize')
      : component.onClick
        ? 'pointer'
        : ''
    setStyle(element, 'cursor', cursor)

    if (component.live) this.live.push(component)
    component.paint(element, this.scale)
    for (const effect of component.effects) effect.apply(element, component, this.scale)

    if (this.debug) {
      setStyle(element, 'outline', '1px solid rgba(255, 0, 128, 0.35)')
      setStyle(element, 'outline-offset', '-1px')
    }

    if (component.children.length === 0) return

    if (
      left + width < clip.left - MARGIN ||
      top + height < clip.top - MARGIN ||
      left > clip.right + MARGIN ||
      top > clip.bottom + MARGIN
    ) {
      return
    }

    let inner = clip
    for (const effect of component.effects) {
      if (!effect.clips) continue
      const shift = scrollMetrics(element).top / scale
      inner = {
        left: Math.max(clip.left, left),
        top: Math.max(clip.top, top) + shift,
        right: Math.min(clip.right, left + width),
        bottom: Math.min(clip.bottom, top + height) + shift,
      }
      break
    }

    for (const child of component.children) this.position(child, component, inner)
  }

  start(): void {
    if (this.running) return
    this.running = true
    let reported = ''
    const loop = () => {
      if (!this.running) return
      try {
        if (layoutOwed(performance.now())) this.render()
        else this.paintLive()
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
