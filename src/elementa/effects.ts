import type { UIComponent } from './component'
import { type ColorConstraint, ConstantColorConstraint } from './constraints'
import { type Color, toCss, withAlpha } from './color'
import { type State, toState } from './state'
import { setStyle } from './style'

export abstract class Effect {
  abstract apply(element: HTMLElement, component: UIComponent, scale: number): void

  invalidate(): void {}

  readonly clips: boolean = false
}

export interface ScrollMetrics {
  top: number
  height: number
  client: number
}

const scrollers = new Set<HTMLElement>()
const measured = new WeakMap<HTMLElement, ScrollMetrics>()
const UNSCROLLED: ScrollMetrics = { top: 0, height: 0, client: 0 }

export const scrollMetrics = (element: HTMLElement | null): ScrollMetrics =>
  (element && measured.get(element)) ?? UNSCROLLED

export function measureScrollers(): void {
  for (const element of scrollers) {
    if (!element.isConnected) {
      scrollers.delete(element)
      continue
    }
    let held = measured.get(element)
    if (!held) {
      held = { top: 0, height: 0, client: 0 }
      measured.set(element, held)
    }
    held.top = element.scrollTop
    held.height = element.scrollHeight
    held.client = element.clientHeight
  }
}

export class OutlineEffect extends Effect {
  private readonly color: ColorConstraint

  constructor(
    color: Color | State<Color>,
    readonly width = 1,
  ) {
    super()
    this.color = new ConstantColorConstraint(color)
  }

  override apply(element: HTMLElement, component: UIComponent, scale: number): void {
    const width = this.width * scale
    setStyle(element, 'outline', `${width}px solid ${toCss(this.color.getColor(component))}`)
    setStyle(element, 'outline-offset', `-${width}px`)
  }

  override invalidate(): void {
    this.color.invalidate()
  }
}

export class ShowEffect extends Effect {
  constructor(private readonly shown: State<boolean>) {
    super()
  }

  override apply(element: HTMLElement): void {
    const shown = this.shown.get()
    const wait = shown ? '0s' : '0.15s'
    setStyle(element, 'transition', `opacity 0.15s ease-out, visibility 0s linear ${wait}`)
    setStyle(element, 'opacity', shown ? '1' : '0')
    setStyle(element, 'visibility', shown ? 'visible' : 'hidden')
    setStyle(element, 'pointer-events', 'none')
  }
}

const REACH = 150

const ARRIVE_SECONDS = 0.85
const ARRIVE_FROM = 14
const LEAVE_SECONDS = 0.3
const SLIDE_SECONDS = 0.5

const STAGGER = 60
const STAGGER_MAX = 10

export const AFTER_BOX = 5

let quiet = false

let motion = true
export const setMotion = (on: boolean): void => {
  motion = on
  if (on || typeof document === 'undefined') return
  for (const element of document.querySelectorAll('.waiting, .arrived, .slides')) {
    element.classList.remove('waiting', 'arrived', 'from-below', 'still')
    ;(element as HTMLElement).style.transform = ''
  }
}

export function quietly(build: () => void): void {
  quiet = true
  try {
    build()
  } finally {
    quiet = false
  }
}

let styled = false

function style(): void {
  if (styled || typeof document === 'undefined') return
  styled = true
  const sheet = document.createElement('style')
  sheet.textContent = `
    @keyframes arrive { from { opacity: 0; transform: translateY(-${ARRIVE_FROM}px) } }
    @keyframes arrive-up { from { opacity: 0; transform: translateY(${ARRIVE_FROM}px) } }
    @keyframes appear { from { opacity: 0 } }
    @keyframes fade { to { opacity: 0 } }
    .waiting { opacity: 0 }
    .arrived { animation: arrive ${ARRIVE_SECONDS}s cubic-bezier(0.22, 1, 0.36, 1) both }
    .arrived.from-below { animation-name: arrive-up }
    .arrived.still { animation-name: appear }
    .leaving { animation: arrive ${LEAVE_SECONDS}s ease-in reverse both !important; animation-delay: 0ms !important }
    .slides { transition: transform ${SLIDE_SECONDS}s cubic-bezier(0.22, 1, 0.36, 1) }
    .fading { animation: fade ${LEAVE_SECONDS}s ease-in both !important; animation-delay: 0ms !important }
    .lit {
      background-image: radial-gradient(
        circle ${REACH}px at var(--mx, -1000px) var(--my, -1000px),
        var(--glow, transparent),
        transparent 70%
      );
    }
  `
  document.head.appendChild(sheet)
}

const arrive = (element: HTMLElement, order: number, fromBelow = false, slide = true): void => {
  setStyle(element, 'animation-delay', `${order * STAGGER}ms`)
  element.dataset.since = `${performance.now() - order * STAGGER}`
  element.classList.remove('waiting')
  element.classList.toggle('from-below', fromBelow)
  element.classList.toggle('still', !slide)
  element.classList.add('arrived')
  ended(element, () => element.classList.remove('arrived'))
}

const ended = (element: HTMLElement, then: () => void): void => {
  const listener = (event: AnimationEvent): void => {
    if (event.target !== element) return
    element.removeEventListener('animationend', listener)
    then()
  }
  element.addEventListener('animationend', listener)
}

const wait = (element: HTMLElement): void => {
  element.classList.remove('arrived', 'from-below')
  element.classList.add('waiting')
}

export function leave(element: HTMLElement | null, slide: boolean, then: () => void): void {
  if (!element || !element.isConnected || !motion) {
    then()
    return
  }
  style()
  let done = false
  const once = (): void => {
    if (done) return
    done = true
    then()
  }
  ended(element, once)
  setTimeout(once, LEAVE_SECONDS * 1000 + 100)
  element.classList.add(slide ? 'leaving' : 'fading')
}

export function rearrive(element: HTMLElement | null): void {
  if (element) element.dataset.rearrive = ''
}

let jumped: HTMLElement[] = []

const rehomed = new WeakSet<HTMLElement>()
export const rehome = (element: HTMLElement): void => {
  rehomed.add(element)
}

const sliding = new WeakSet<HTMLElement>()

const slide = (element: HTMLElement, dx: number, dy: number): void => {
  if (!motion) return
  element.classList.remove('arrived', 'from-below')
  if (sliding.has(element)) {
    const now = new DOMMatrix(getComputedStyle(element).transform)
    dx += now.e
    dy += now.f
  } else {
    sliding.add(element)
    const done = (event: TransitionEvent): void => {
      if (event.target !== element) return
      element.removeEventListener('transitionend', done)
      sliding.delete(element)
    }
    element.addEventListener('transitionend', done)
  }
  element.style.transition = 'none'
  element.style.transform = `translate(${dx}px, ${dy}px)`
  if (jumped.push(element) > 1) return
  requestAnimationFrame(() => {
    const moved = jumped
    jumped = []
    for (const box of moved) {
      box.style.transition = ''
      box.style.transform = ''
    }
  })
}

export class RiseEffect extends Effect {
  private armed = false
  private readonly quiet = quiet

  constructor(
    private readonly order = 0,
    private readonly slide = true,
  ) {
    super()
  }

  override apply(element: HTMLElement): void {
    if (this.armed) return
    this.armed = true
    if (this.quiet || !motion) return
    style()
    arrive(element, this.order, false, this.slide)
  }
}

const arrivals = new Map<Element | null, IntersectionObserver>()

function observerFor(element: HTMLElement): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null
  const root = element.parentElement?.closest('[data-scrolls]') ?? null
  let held = arrivals.get(root)
  if (!held) {
    held = new IntersectionObserver(
      (entries) => {
        if (!motion) return
        const coming: IntersectionObserverEntry[] = []
        let above = false
        for (const entry of entries) {
          const target = entry.target as HTMLElement
          if (!target.isConnected) continue
          if (!entry.isIntersecting) {
            wait(target)
            continue
          }
          if (!target.classList.contains('waiting')) continue
          coming.push(entry)
          if (entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)) above = true
        }
        coming.sort(
          (a, b) =>
            a.boundingClientRect.top - b.boundingClientRect.top ||
            a.boundingClientRect.left - b.boundingClientRect.left,
        )
        if (above) coming.reverse()
        coming.forEach((entry, order) => {
          arrive(entry.target as HTMLElement, Math.min(order, STAGGER_MAX), above)
        })
      },
      { root },
    )
    arrivals.set(root, held)
  }
  return held
}

export class FadeInEffect extends Effect {
  private armed = false
  private readonly quiet = quiet
  private x = NaN
  private y = NaN

  override apply(element: HTMLElement, component: UIComponent, scale: number): void {
    const x = component.getLeft() * scale
    const y = component.getTop() * scale

    if (!this.armed) {
      this.armed = true
      style()
      element.classList.add('slides')
      if (!this.quiet && motion) element.classList.add('waiting')
      observerFor(element)?.observe(element)
    } else if ('rearrive' in element.dataset) {
      delete element.dataset.rearrive
      const watching = observerFor(element)
      watching?.unobserve(element)
      if (motion) wait(element)
      watching?.observe(element)
    } else if (rehomed.delete(element) && !element.classList.contains('waiting')) {
      if (x === this.x && y === this.y) {
        if (element.classList.contains('arrived')) {
          const since = Number(element.dataset.since)
          setStyle(element, 'animation-delay', `${since - performance.now()}ms`)
        }
      } else if (Number.isNaN(this.x)) {
      } else {
        const seen = viewOf(component, scale)
        const height = component.getHeight() * scale
        const inView = (at: number): boolean =>
          !seen || (at + height > seen.top - height && at < seen.bottom + height)
        if (inView(this.y) && inView(y)) slide(element, this.x - x, this.y - y)
        else rearrive(element)
      }
    }

    this.x = x
    this.y = y
  }
}

function viewOf(component: UIComponent, scale: number): { top: number; bottom: number } | null {
  for (let node = component.parent; node; node = node.parent) {
    if (!node.effects.some((effect) => effect.clips)) continue
    const measured = scrollMetrics(node.element)
    const top = node.getTop() * scale + measured.top
    return { top, bottom: top + (measured.client || node.getHeight() * scale) }
  }
  return null
}

export class ScissorEffect extends Effect {
  override readonly clips = true

  override apply(element: HTMLElement): void {
    setStyle(element, 'overflow', 'hidden')
  }
}

export class ScrollEffect extends Effect {
  override readonly clips = true
  private readonly fade: State<number>

  constructor(
    fade: number | State<number> = 20,

    readonly nativeScrollbar = true,
  ) {
    super()
    this.fade = toState(fade)
  }

  override apply(element: HTMLElement, _component: UIComponent, scale: number): void {
    scrollers.add(element)
    element.dataset.scrolls = ''
    setStyle(element, 'overflow', 'hidden auto')
    setStyle(element, 'scrollbar-width', this.nativeScrollbar ? 'thin' : 'none')
    if (this.nativeScrollbar) setStyle(element, 'scrollbar-gutter', 'stable')

    const fade = this.fade.get()
    if (fade <= 0) {
      setStyle(element, 'mask-image', 'none')
      return
    }
    const edge = `${fade * scale}px`
    setStyle(
      element,
      'mask-image',
      `linear-gradient(to bottom, transparent, #000 ${edge}, #000 calc(100% - ${edge}), transparent)`,
    )
  }
}

const lit = new Set<HTMLElement>()
let onScreen: IntersectionObserver | null = null
const pointer = { x: -1e4, y: -1e4 }
let shining = false

const shine = (): void => {
  shining = false
  for (const element of lit) {
    const box = element.getBoundingClientRect()
    const dx = Math.max(box.left - pointer.x, 0, pointer.x - box.right)
    const dy = Math.max(box.top - pointer.y, 0, pointer.y - box.bottom)
    const near = dx * dx + dy * dy < REACH * REACH
    setStyle(element, '--mx', near ? `${pointer.x - box.left}px` : '')
    setStyle(element, '--my', near ? `${pointer.y - box.top}px` : '')
  }
}

const queueShine = (): void => {
  if (shining) return
  shining = true
  requestAnimationFrame(shine)
}

function track(): IntersectionObserver | null {
  if (onScreen !== null || typeof IntersectionObserver === 'undefined') return onScreen
  onScreen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement
      if (entry.isIntersecting) lit.add(element)
      else {
        lit.delete(element)
        setStyle(element, '--mx', '')
        setStyle(element, '--my', '')
      }
    }
    queueShine()
  })
  addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      queueShine()
    },
    { passive: true },
  )
  addEventListener('scroll', queueShine, { capture: true, passive: true })
  return onScreen
}

export class LightEffect extends Effect {
  private armed = false

  constructor(private readonly colour: State<Color>) {
    super()
  }

  override apply(element: HTMLElement): void {
    setStyle(element, '--glow', toCss(withAlpha(this.colour.get(), 30)))
    if (this.armed) return
    this.armed = true
    style()
    element.classList.add('lit')
    track()?.observe(element)
  }
}

export class LayerEffect extends Effect {
  constructor(private readonly level: number) {
    super()
  }

  override apply(element: HTMLElement): void {
    setStyle(element, 'z-index', `${this.level}`)
  }
}
