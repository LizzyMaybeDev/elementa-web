import type { UIComponent } from './component'
import { type ColorConstraint, ConstantColorConstraint } from './constraints'
import { type Color, shadowOf, toCss, withAlpha } from './color'
import { type State, toState } from './state'
import { setStyle } from './style'
import { touch } from './device'

export abstract class Effect {
  abstract apply(element: HTMLElement, component: UIComponent, scale: number): void

  invalidate(): void {}

  readonly clips: boolean = false

  readonly scrolls: boolean = false
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

export const shadowFor = (color: Color, pixel: number, shadow: boolean): string =>
  shadow ? `${pixel}px ${pixel}px 0 ${toCss(shadowOf(color))}` : 'none'

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
    @keyframes enter-side { from { opacity: 0; transform: translateX(28px) } }
    @keyframes drain { from { width: 100% } to { width: 0% } }
    .enters { animation: enter-side ${ARRIVE_SECONDS}s cubic-bezier(0.22, 1, 0.36, 1) both }
    .exits { animation: enter-side ${LEAVE_SECONDS}s ease-in reverse both !important }
    .draining { animation: drain linear both }
    
    
    @keyframes swell {
      from { transform: translate(-50%, -50%) scale(0) }
      to { transform: translate(-50%, -50%) scale(1) }
    }
    @keyframes dim {
      0% { opacity: 0 }
      8% { opacity: 1 }
      38% { opacity: 0.92 }
      66% { opacity: 0.58 }
      100% { opacity: 0 }
    }
    .ripple {
      position: absolute;
      pointer-events: none;
      
      background: radial-gradient(
        circle closest-side at 50% 50%,
        rgba(255, 255, 255, 0) 40%,
        rgba(255, 255, 255, 0.006) 58%,
        rgba(255, 255, 255, 0.022) 71%,
        rgba(255, 255, 255, 0.05) 82%,
        rgba(255, 255, 255, 0.075) 89%,
        rgba(255, 255, 255, 0.042) 94%,
        rgba(255, 255, 255, 0.011) 98%,
        rgba(255, 255, 255, 0) 100%
      );
      will-change: transform, opacity;
      animation:
        swell ${WASH_SECONDS}s cubic-bezier(0.22, 0.86, 0.24, 1) both,
        dim ${WASH_SECONDS}s linear both;
    }

    
    @keyframes bloom {
      from { transform: translate(-50%, -50%) scale(0); opacity: 0.6 }
      55% { opacity: 0.3 }
      to { transform: translate(-50%, -50%) scale(1); opacity: 0 }
    }
    .bloom {
      position: absolute;
      pointer-events: none;
      border-radius: 50%;
      will-change: transform, opacity;
      animation: bloom 0.78s cubic-bezier(0.19, 0.84, 0.26, 1) forwards;
    }

    
    @keyframes sparkgrow {
      from { transform: translate(-50%, -50%) scale(0.18) }
      to { transform: translate(-50%, -50%) scale(2.9) }
    }
    @keyframes sparkgo {
      0% { opacity: 0 }
      12% { opacity: 1 }
      100% { opacity: 0 }
    }
    .spark {
      position: absolute;
      pointer-events: none;
      
      background: radial-gradient(
        circle closest-side at 50% 50%,
        rgba(255, 255, 255, 0.5) 0%,
        rgba(255, 255, 255, 0.36) 14%,
        rgba(255, 255, 255, 0.2) 27%,
        rgba(255, 255, 255, 0.1) 41%,
        rgba(255, 255, 255, 0.042) 55%,
        rgba(255, 255, 255, 0.015) 68%,
        rgba(255, 255, 255, 0.004) 84%,
        rgba(255, 255, 255, 0) 100%
      );
      will-change: transform, opacity;
      animation:
        sparkgrow ${SPARK_SECONDS}s cubic-bezier(0.16, 0.82, 0.28, 1) both,
        sparkgo ${SPARK_SECONDS}s linear both;
    }

    
    
    @keyframes pointed {
      0% { opacity: 0 }
      6% { opacity: 1 }
      84% { opacity: 1 }
      100% { opacity: 0 }
    }
    .pointed { animation: pointed 5.4s cubic-bezier(0.33, 1, 0.68, 1) both }

    
    .tap {
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
      text-decoration-thickness: 1px;
    }
    .tap:hover { filter: brightness(1.35) }

    @keyframes shimmer { from { background-position: 210% 0 } to { background-position: -110% 0 } }
    .shining { position: relative; display: inline-block }
    .shining::after {
      content: attr(data-shine);
      position: absolute;
      inset: 0;
      pointer-events: none;
      text-shadow: none;
      background-image: linear-gradient(
        105deg,
        transparent 38%,
        rgba(255, 255, 255, 0.92) 50%,
        transparent 62%
      );
      background-size: 420% 100%;
      background-clip: text;
      -webkit-background-clip: text;
      color: transparent;
      -webkit-text-fill-color: transparent;
      animation: shimmer 2.8s linear infinite;
    }
    .lit::before, .lit::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      opacity: var(--lit, 0);
      transition: opacity 0.35s ease-out;
    }
    .lit::before {
      background: radial-gradient(
        ${REACH * 1.6}px circle at var(--mx, -1000px) var(--my, -1000px),
        var(--glow, transparent),
        transparent 65%
      );
    }
    .lit::after {
      padding: 1px;
      background: radial-gradient(
        ${REACH}px circle at var(--mx, -1000px) var(--my, -1000px),
        var(--rim, transparent),
        transparent 70%
      );
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      mask-composite: exclude;
    }
  `
  document.head.appendChild(sheet)
}

export const shimmer = (): void => style()

const WASH_SECONDS = 1.9
const SPARK_SECONDS = 0.9

const RING = 780
const SPARK = 56

let readyAt = 0

let held: { spark: HTMLElement; wave: HTMLElement } | null = null

let clearing: ReturnType<typeof setTimeout> | null = null

function again(element: HTMLElement): void {
  for (const running of element.getAnimations?.() ?? []) {
    running.currentTime = 0
    running.play()
  }
}

export function ripple(host: HTMLElement | null, event: MouseEvent): void {
  if (!host || !motion) return
  const now = performance.now()
  if (now < readyAt) return
  readyAt = now + WASH_SECONDS * 1000
  style()

  if (!held) {
    const make = (name: string, size: number): HTMLElement => {
      const element = document.createElement('div')
      element.className = name
      element.style.width = `${size}px`
      element.style.height = `${size}px`
      return element
    }
    held = { spark: make('spark', SPARK), wave: make('ripple', RING) }
  }

  const box = host.getBoundingClientRect()
  const x = event.clientX - box.left
  const y = event.clientY - box.top

  const pieces = [held.wave, held.spark]
  for (const element of pieces) {
    element.remove()
    element.style.left = `${x}px`
    element.style.top = `${y}px`
    host.insertBefore(element, host.firstChild)
    again(element)
  }

  if (clearing) clearTimeout(clearing)
  clearing = setTimeout(
    () => {
      for (const element of pieces) element.remove()
      clearing = null
    },
    WASH_SECONDS * 1000 + 120,
  )
}

export function bloom(element: HTMLElement | null, event: MouseEvent, colour: string): void {
  if (!element || !motion) return
  style()
  const box = element.getBoundingClientRect()
  const x = event.clientX - box.left
  const y = event.clientY - box.top

  const reach = 2 * Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y))
  const blob = document.createElement('div')
  blob.className = 'bloom'
  blob.style.left = `${x}px`
  blob.style.top = `${y}px`
  blob.style.width = `${reach}px`
  blob.style.height = `${reach}px`
  blob.style.background = colour
  setStyle(element, 'overflow', 'hidden')
  element.insertBefore(blob, element.firstChild)
  blob.addEventListener('animationend', () => blob.remove(), { once: true })
}

const starting = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

const arrive = (element: HTMLElement, order: number, fromBelow = false, slide = true): void => {
  const begin = (): void => {
    starting.delete(element)
    if (!element.isConnected || !element.classList.contains('waiting')) return
    setStyle(element, 'animation-delay', '0ms')
    element.dataset.since = `${performance.now()}`
    element.classList.remove('waiting')
    element.classList.toggle('from-below', fromBelow)
    element.classList.toggle('still', !slide)
    element.classList.add('arrived')
    ended(element, () => element.classList.remove('arrived'))
  }
  clearTimeout(starting.get(element))

  element.classList.add('waiting')
  if (order === 0) begin()
  else starting.set(element, setTimeout(begin, order * STAGGER))
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
  clearTimeout(starting.get(element))
  starting.delete(element)
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

const watchedBy = new WeakMap<HTMLElement, IntersectionObserver>()

function observerFor(element: HTMLElement): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null
  const root = element.parentElement?.closest('[data-scrolls]') ?? null

  for (const [held, watching] of arrivals) {
    if (held && !held.isConnected) {
      watching.disconnect()
      arrivals.delete(held)
    }
  }
  let held = arrivals.get(root)
  if (!held) {
    held = new IntersectionObserver(
      (entries) => {

        if (root && !root.isConnected) {
          held?.disconnect()
          arrivals.delete(root)
          return
        }
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

const rewatch = (element: HTMLElement): void => {
  const watching = observerFor(element)
  if (!watching || watchedBy.get(element) === watching) return
  watchedBy.get(element)?.unobserve(element)
  watching.observe(element)
  watchedBy.set(element, watching)
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
      const watching = observerFor(element)
      watching?.observe(element)
      if (watching) watchedBy.set(element, watching)
    } else if ('rearrive' in element.dataset) {
      delete element.dataset.rearrive
      const watching = observerFor(element)
      watchedBy.get(element)?.unobserve(element)
      if (motion) wait(element)
      watching?.observe(element)
      if (watching) watchedBy.set(element, watching)
    } else if (rehomed.has(element) && element.classList.contains('waiting')) {

      rehomed.delete(element)
      rewatch(element)
    } else if (rehomed.delete(element) && !element.classList.contains('waiting')) {

      rewatch(element)

      if (element.classList.contains('arrived')) {
        const since = Number(element.dataset.since)
        setStyle(element, 'animation-delay', `${since - performance.now()}ms`)
      }
      if (x === this.x && y === this.y) {
      } else if (Number.isNaN(this.x)) {
      } else {
        const seen = viewOf(component, scale)
        const height = component.getHeight() * scale
        const inView = (at: number): boolean =>
          !seen || (at + height > seen.top - height && at < seen.bottom + height)
        if (touch) {

        } else if (inView(this.y) && inView(y)) slide(element, this.x - x, this.y - y)
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

export class DrawerEffect extends Effect {
  private placed = false

  constructor(
    private readonly open: State<boolean>,
    private readonly travel: number,
  ) {
    super()
  }

  override apply(element: HTMLElement, _component: UIComponent, scale: number): void {

    setStyle(
      element,
      'transition',
      this.placed && motion ? `transform ${SLIDE_SECONDS}s cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
    )
    setStyle(element, 'transform', this.open.get() ? '' : `translateX(${-this.travel * scale}px)`)
    this.placed = true
  }
}

export class TurnEffect extends Effect {
  override apply(element: HTMLElement): void {
    setStyle(element, 'transform', 'rotate(45deg)')
  }
}

const gliding = new WeakMap<HTMLElement, Map<string, string>>()

const glideWith = (element: HTMLElement, property: string, how: string): string => {
  let held = gliding.get(element)
  if (!held) gliding.set(element, (held = new Map()))
  held.set(property, `${property} ${how}`)
  return motion ? [...held.values()].join(', ') : 'none'
}

export class TransitionEffect extends Effect {
  private scale = NaN
  private skipping = false

  skip(): void {
    this.skipping = true
  }

  constructor(
    private readonly property: 'height' | 'width' | 'top' | 'left' | 'opacity',
    private readonly seconds: number,
    private readonly easing = 'cubic-bezier(0.22, 1, 0.36, 1)',
  ) {
    super()
  }

  override apply(element: HTMLElement, _component: UIComponent, scale: number): void {
    const glide = glideWith(element, this.property, `${this.seconds}s ${this.easing}`)

    if (scale !== this.scale || this.skipping) {
      this.scale = scale
      this.skipping = false
      setStyle(element, 'transition', 'none')
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setStyle(element, 'transition', glide)),
      )
      return
    }
    setStyle(element, 'transition', glide)
  }
}

const EDGE_OUT = '0.62s cubic-bezier(0.33, 1, 0.68, 1)'
const EDGE_BACK = '0.34s ease-in'

const SIZE = 'background-size'

const WASH: [alpha: number, at: number][] = [
  [84, 0],
  [58, 10],
  [36, 22],
  [19, 38],
  [8, 60],
  [0, 100],
]

const WASH_REACH = 58

export class EdgeEffect extends Effect {
  private readonly colour: ColorConstraint
  private ink: Color | null = null
  private image = ''
  private placed = false
  private drawn = NaN

  constructor(

    private readonly out: State<number>,
    colour: Color | State<Color>,

    private readonly side = 3,
  ) {
    super()
    this.colour = new ConstantColorConstraint(colour)
  }

  override apply(element: HTMLElement, component: UIComponent, scale: number): void {

    const ink = this.colour.getColor(component)
    if (ink !== this.ink) {
      this.ink = ink
      const paint = toCss(ink)
      const wash = WASH.map(([alpha, at]) => `${toCss(withAlpha(ink, alpha))} ${at}%`).join(', ')
      this.image = `linear-gradient(${paint}, ${paint}), linear-gradient(90deg, ${wash})`
    }
    setStyle(element, 'background-image', this.image)
    setStyle(element, 'background-position', 'left top')
    setStyle(element, 'background-repeat', 'no-repeat')

    if (scale !== this.drawn) {
      this.drawn = scale
      this.placed = false
    }

    const out = Math.max(0, Math.min(1, this.out.get()))
    setStyle(
      element,
      'transition',
      this.placed ? glideWith(element, SIZE, out ? EDGE_OUT : EDGE_BACK) : 'none',
    )
    setStyle(element, SIZE, `${this.side * scale * out}px 100%, ${out * WASH_REACH}% 100%`)
    this.placed = true
  }

  override invalidate(): void {
    this.colour.invalidate()
  }
}

export class ScissorEffect extends Effect {
  override readonly clips = true

  override apply(element: HTMLElement): void {
    setStyle(element, 'overflow', 'hidden')
  }
}

export class TuckEffect extends Effect {
  override readonly scrolls = true
  private placed = false

  constructor(private readonly watching: () => UIComponent | null) {
    super()
  }

  override apply(element: HTMLElement, component: UIComponent, scale: number): void {
    const seen = scrollMetrics(this.watching()?.element ?? null)

    const ended = seen.top + seen.client >= seen.height - 1
    const away = !ended

    setStyle(
      element,
      'transition',
      this.placed && motion ? 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
    )
    this.placed = true
    const held = component.parent
    const floor = held
      ? held.getTop() + held.getHeight()
      : component.getTop() + component.getHeight()
    const drop = (floor - component.getTop()) * scale
    setStyle(element, 'transform', away ? `translateY(${drop}px)` : '')
  }
}

export class ScrollEffect extends Effect {
  override readonly clips = true
  private readonly fade: State<number>
  private readonly ground: State<Color> | null
  private edges: [HTMLElement, HTMLElement] | null = null

  constructor(
    fade: number | State<number> = 20,

    readonly nativeScrollbar = true,
    ground: State<Color> | null = null,
  ) {
    super()
    this.fade = toState(fade)
    this.ground = ground
  }

  override apply(element: HTMLElement, _component: UIComponent, scale: number): void {
    scrollers.add(element)
    element.dataset.scrolls = ''
    setStyle(element, 'overflow', 'hidden auto')

    setStyle(element, 'overscroll-behavior-y', 'none')

    setStyle(element, 'scrollbar-width', this.nativeScrollbar ? 'thin' : 'none')
    if (this.nativeScrollbar) setStyle(element, 'scrollbar-gutter', 'stable')

    const fade = this.fade.get()
    if (fade <= 0 || !this.ground) {
      setStyle(element, 'mask-image', fade <= 0 || this.ground ? 'none' : this.mask(fade * scale))
      for (const edge of this.edges ?? []) setStyle(edge, 'display', 'none')
      return
    }

    const parent = element.parentElement
    if (!parent) return
    if (!this.edges) {
      this.edges = [document.createElement('div'), document.createElement('div')]
      for (const edge of this.edges) {
        edge.style.cssText = 'position:absolute;pointer-events:none'
        parent.appendChild(edge)
      }
    }
    const colour = this.ground.get()
    const from = toCss(colour)
    const to = toCss(withAlpha(colour, 0))
    const height = `${fade * scale}px`
    const [top, bottom] = this.edges
    for (const edge of this.edges) {
      if (edge.parentElement !== parent) parent.appendChild(edge)
      setStyle(edge, 'display', '')
      setStyle(edge, 'left', element.style.left)
      setStyle(edge, 'width', element.style.width)
      setStyle(edge, 'height', height)
    }
    setStyle(top, 'top', element.style.top)
    setStyle(top, 'background', `linear-gradient(to bottom, ${from}, ${to})`)
    setStyle(bottom, 'top', `calc(${element.style.top} + ${element.style.height} - ${height})`)
    setStyle(bottom, 'background', `linear-gradient(to top, ${from}, ${to})`)
  }

  private mask(edge: number): string {
    return `linear-gradient(to bottom, transparent, #000 ${edge}px, #000 calc(100% - ${edge}px), transparent)`
  }
}

const lit = new Set<HTMLElement>()
let onScreen: IntersectionObserver | null = null
const pointer = { x: -1e4, y: -1e4 }

let wanted = false

export const shine = (): void => {
  if (!wanted || !lighting) return
  wanted = false
  for (const element of lit) {
    const box = element.getBoundingClientRect()
    const dx = Math.max(box.left - pointer.x, 0, pointer.x - box.right)
    const dy = Math.max(box.top - pointer.y, 0, pointer.y - box.bottom)
    const near = dx * dx + dy * dy < REACH * REACH

    if (near) {
      setStyle(element, '--mx', `${pointer.x - box.left}px`)
      setStyle(element, '--my', `${pointer.y - box.top}px`)
    }
    setStyle(element, '--lit', near ? '1' : '0')
  }
}

const queueShine = (): void => {
  wanted = true
}

let lighting = true

export const setLight = (on: boolean): void => {
  lighting = on
  if (on || typeof document === 'undefined') return
  for (const element of document.querySelectorAll('.lit')) {
    setStyle(element as HTMLElement, '--lit', '0')
  }
}

function track(): IntersectionObserver | null {
  if (onScreen !== null || typeof IntersectionObserver === 'undefined') return onScreen
  onScreen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement
      if (entry.isIntersecting) lit.add(element)
      else {
        lit.delete(element)
        setStyle(element, '--lit', '0')
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
    if (touch) return

    setStyle(element, '--glow', toCss(withAlpha(this.colour.get(), 26)))
    setStyle(element, '--rim', toCss(withAlpha(this.colour.get(), 150)))
    if (this.armed) return
    this.armed = true
    style()
    element.classList.add('lit')
    track()?.observe(element)
  }
}

export const LAYERS = {
  titleBar: 1,
  dropdown: 4,
  dialog: 6,
  toast: 8,
} as const

export class SideEffect extends Effect {
  private armed = false
  private readonly quiet = quiet

  override apply(element: HTMLElement): void {
    if (this.armed) return
    this.armed = true
    if (this.quiet || !motion) return
    style()
    element.classList.add('enters')
    ended(element, () => element.classList.remove('enters'))
  }
}

export function slideAway(element: HTMLElement | null, then: () => void): void {
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
  element.classList.remove('enters')
  element.classList.add('exits')
}

export class DrainEffect extends Effect {
  private armed = false

  constructor(
    private readonly seconds: number,
    private readonly held: State<boolean>,
  ) {
    super()
  }

  override apply(element: HTMLElement): void {
    if (!this.armed) {
      this.armed = true
      style()
      setStyle(element, 'animation-duration', `${this.seconds}s`)
      element.classList.add('draining')
    }
    setStyle(element, 'animation-play-state', this.held.get() ? 'paused' : 'running')
  }
}

export class PointEffect extends Effect {
  private was = false

  constructor(private readonly on: State<boolean>) {
    super()
  }

  override apply(element: HTMLElement): void {
    const now = this.on.get()
    setStyle(element, 'opacity', '0')
    if (now && !this.was && motion) {
      style()
      element.classList.remove('pointed')

      void element.offsetWidth
      element.classList.add('pointed')
    }
    this.was = now
  }
}

export class LayerEffect extends Effect {
  private readonly level: State<number>

  constructor(level: number | State<number>) {
    super()
    this.level = toState(level)
  }

  override apply(element: HTMLElement): void {
    setStyle(element, 'z-index', `${this.level.get()}`)
  }
}
