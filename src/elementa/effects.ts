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
    if (sendTo && sendTo.scroller === element) held.top = sendTo.at
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

const RECOLOUR = 0.4

const ARRIVE_SECONDS = 0.85
const ARRIVE_FROM = 14
const LEAVE_SECONDS = 0.3
const SLIDE_SECONDS = 0.5

const STAGGER = 60
const BARELY = 200
const EDGE_SLACK = 48
const STAGGER_MAX = 10

export const AFTER_BOX = 5

export const arrivesAfter = (order: number): number =>
  motion ? order * STAGGER + ARRIVE_SECONDS * 1000 : 0

let quiet = false

let motion = true
export const setMotion = (on: boolean): void => {
  motion = on
  if (on || typeof document === 'undefined') return
  for (const element of document.querySelectorAll('.waiting, .arrived, .gliding')) {
    element.classList.remove('waiting', 'arrived', 'from-below', 'still', 'aside')
    ;(element as HTMLElement).style.transform = ''
    settle(element as HTMLElement)
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
    
    .recolouring, .recolouring * {
      transition:
        background-color ${RECOLOUR}s ease,
        color ${RECOLOUR}s ease,
        outline-color ${RECOLOUR}s ease,
        text-shadow ${RECOLOUR}s ease !important;
    }
    .waiting { opacity: 0 }
    .arrived { animation: arrive ${ARRIVE_SECONDS}s cubic-bezier(0.22, 1, 0.36, 1) both }
    .arrived.from-below { animation-name: arrive-up }
    .arrived.still { animation-name: appear }
    
    .arrived.aside { animation-name: enter-side }
    .leaving { animation: arrive ${LEAVE_SECONDS}s ease-in reverse both !important; animation-delay: 0ms !important }
    .fading { animation: fade ${LEAVE_SECONDS}s ease-in both !important; animation-delay: 0ms !important }
    .going { animation: fade ${SLIDE_SECONDS}s ease-out both !important; animation-delay: 0ms !important }
    @keyframes reword { from { opacity: 0; transform: translateX(14px) } }
    .reword { animation: reword 0.45s cubic-bezier(0.22, 1, 0.36, 1) both }
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

    
    .glimmer {
      filter:
        drop-shadow(0 0 calc(var(--glimmer, 1px) * 2) currentColor)
        drop-shadow(0 0 calc(var(--glimmer, 1px) * 5) currentColor)
        drop-shadow(0 0 calc(var(--glimmer, 1px) * 10) currentColor);
    }
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

let recolouring: ReturnType<typeof setTimeout> | undefined

export function recolour(): void {
  if (!motion || typeof document === 'undefined') return
  style()
  const page = document.documentElement
  page.classList.add('recolouring')
  clearTimeout(recolouring)
  recolouring = setTimeout(() => page.classList.remove('recolouring'), RECOLOUR * 1000 + 80)
}

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
  if (!motion) {
    element.classList.remove('waiting')
    return
  }
  const begin = (): void => {
    starting.delete(element)
    if (!element.isConnected || !element.classList.contains('waiting')) return
    setStyle(element, 'animation-delay', '0ms')
    element.dataset.since = `${performance.now()}`
    const aside = 'aside' in element.dataset
    delete element.dataset.aside
    element.classList.remove('waiting')
    element.classList.toggle('aside', aside)
    element.classList.toggle('from-below', !aside && fromBelow)
    element.classList.toggle('still', !aside && !slide)
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

if (import.meta.env.DEV && typeof globalThis !== 'undefined') {
  interface Row {
    t: number
    top: number
    left: number
    tr: string
    tf: string
    op: string
    cls: string
    anims: number
  }
  const self = globalThis as {
    __watch?: (needle: string, frames?: number) => void
    __frames?: unknown[]
    __springs?: (rise?: number, back?: number, within?: number) => unknown[]
  }
  let tracks = new Map<HTMLElement, { who: string; rows: Row[] }>()
  self.__watch = (needle: string, frames = 300): void => {
    tracks = new Map()
    self.__frames = []
    const started = performance.now()
    const step = (): void => {
      const now = Math.round(performance.now() - started)
      for (const element of document.querySelectorAll<HTMLElement>('[data-component]')) {
        if (
          !element.textContent?.includes(needle) ||
          element.querySelector('[data-component]')?.textContent?.includes(needle)
        )
          continue
        let shell: HTMLElement = element
        for (let up: HTMLElement | null = element; up; up = up.parentElement) {
          if (up.classList.length || up.getAnimations().length || up.style.translate) {
            shell = up
            break
          }
        }
        const box = shell.getBoundingClientRect()
        const style = getComputedStyle(shell)
        let track = tracks.get(shell)
        if (!track) {
          track = { who: element.textContent.replace(/[\d,%]+/g, '').slice(0, 18), rows: [] }
          tracks.set(shell, track)
        }
        const row: Row = {
          t: now,
          top: Math.round(box.top),
          left: Math.round(box.left),
          tr: style.translate,
          tf: style.transform === 'none' ? '' : style.transform,
          op: style.opacity,
          cls: shell.className,
          anims: shell.getAnimations().length,
        }
        track.rows.push(row)
        self.__frames?.push({ who: track.who, ...row })
      }
      if (--frames > 0) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  self.__springs = (rise = 60, back = 40, within = 400): unknown[] => {
    const out: unknown[] = []
    for (const [, track] of tracks) {
      const rows = track.rows.filter((row) => row.op !== '0')
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].top > rows[i - 1].top - 8) continue
        let low = i
        for (let j = i; j < rows.length && rows[j].t - rows[i].t < within; j++) {
          if (rows[j].top < rows[low].top) low = j
        }
        if (rows[i - 1].top - rows[low].top < rise) continue
        let returned = -1
        for (let j = low; j < rows.length && rows[j].t - rows[low].t < within; j++) {
          if (rows[j].top - rows[low].top > back) {
            returned = j
            break
          }
        }
        if (returned < 0) continue
        out.push({ who: track.who, from: rows[i - 1].t, rows: rows.slice(Math.max(0, i - 3), returned + 2) })
        i = returned
      }
    }
    return out
  }
}

export const note = (what: string, more: Record<string, unknown> = {}): void => {
  if (!import.meta.env.DEV) return
  const held = ((globalThis as { __trace?: unknown[] }).__trace ??= [])
  held.push({ at: Math.round(performance.now()), what, ...more })
  if (held.length > 200) held.shift()
}

const trace = (what: string, element: HTMLElement, more: Record<string, unknown> = {}): void => {
  if (!import.meta.env.DEV) return
  const held = ((globalThis as { __trace?: unknown[] }).__trace ??= [])
  held.push({
    at: Math.round(performance.now()),
    what,
    who: element.dataset.component ?? element.tagName,
    text: element.textContent?.slice(0, 24),
    top: Math.round(element.getBoundingClientRect().top),
    ...more,
  })
  if (held.length > 200) held.shift()
}

const wait = (element: HTMLElement): void => {
  trace('wait', element, { stack: (new Error().stack ?? '').split(String.fromCharCode(10))[2]?.trim() })
  clearTimeout(starting.get(element))
  starting.delete(element)
  settle(element)
  element.classList.remove('arrived', 'from-below', 'aside')
  element.classList.add('waiting')
}

const going = new WeakMap<HTMLElement, object>()

export function leave(
  element: HTMLElement | null,
  slide: boolean,
  then: () => void,
  gently = false,
): void {
  if (!element || !element.isConnected || !motion) {
    then()
    return
  }
  style()
  const token = {}
  going.set(element, token)
  let done = false
  const once = (): void => {
    if (done) return
    done = true
    if (going.get(element) !== token) return
    going.delete(element)
    element.classList.remove('leaving', 'fading', 'going')
    then()
  }
  ended(element, once)
  setTimeout(once, (gently ? SLIDE_SECONDS : LEAVE_SECONDS) * 1000 + 100)
  element.classList.add(slide ? 'leaving' : gently ? 'going' : 'fading')
}

export function unleave(element: HTMLElement | null): void {
  if (!element) return
  going.delete(element)
  element.classList.remove('leaving', 'fading', 'going')
}

export function reword(element: HTMLElement | null): void {
  if (!element || !motion) return
  style()
  element.classList.remove('reword')
  void element.offsetWidth
  element.classList.add('reword')
  ended(element, () => element.classList.remove('reword'))
}

export function rearrive(element: HTMLElement | null, aside = false): void {
  if (!element) return
  element.dataset.rearrive = ''
  if (aside) element.dataset.aside = ''
}

const rehomed = new WeakSet<HTMLElement>()
export const rehome = (element: HTMLElement): void => {
  rehomed.add(element)
}

export interface Step {
  x: number
  y: number
  at: number
}

const CORNER = 0.5
const CORNER_MAX = 28
const ARC_STEPS = 8

export function gridPath(dx: number, dy: number): Step[] {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const r = Math.min(CORNER_MAX, CORNER * Math.min(ax, ay))
  if (r === 0) return [{ x: dx, y: dy, at: 0 }, { x: 0, y: 0, at: 1 }]
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const down = ay - r
  const arc = (Math.PI / 2) * r
  const across = ax - r
  const length = down + arc + across
  const cx = dx - sx * r
  const cy = sy * r
  const steps: Step[] = [{ x: dx, y: dy, at: 0 }]
  for (let k = 0; k <= ARC_STEPS; k++) {
    const angle = ((Math.PI / 2) * k) / ARC_STEPS
    steps.push({
      x: cx + sx * r * Math.cos(angle),
      y: cy - sy * r * Math.sin(angle),
      at: (down + r * angle) / length,
    })
  }
  steps.push({ x: 0, y: 0, at: 1 })
  return steps
}

export function alongPath(steps: Step[], share: number): { x: number; y: number } {
  if (share <= 0) return { x: steps[0].x, y: steps[0].y }
  for (let i = 1; i < steps.length; i++) {
    const to = steps[i]
    if (share > to.at) continue
    const from = steps[i - 1]
    const span = to.at - from.at
    const t = span > 0 ? (share - from.at) / span : 1
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }
  return { x: 0, y: 0 }
}

const GLIDE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
export const glideEase = cubicBezier(0.4, 0, 0.2, 1)
const eased = glideEase

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const sample = (a: number, b: number, t: number): number =>
    ((1 - t) ** 3) * 0 + 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3
  return (x: number): number => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 24; i++) {
      const at = sample(x1, x2, t)
      if (Math.abs(at - x) < 1e-5) break
      if (at < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sample(y1, y2, t)
  }
}

interface Glide {
  steps: Step[]
  since: number
  animation: Animation | null
  fallback: ReturnType<typeof setTimeout> | null
  turning: boolean
}

const progressOf = (glide: Glide): number => {
  const animation = glide.animation
  const elapsed =
    animation && animation.currentTime !== null
      ? Number(animation.currentTime)
      : animation
        ? 0
        : performance.now() - glide.since
  return Math.max(0, Math.min(1, elapsed / (SLIDE_SECONDS * 1000)))
}

const velocityOf = (glide: Glide): { x: number; y: number } => {
  const t = progressOf(glide)
  const step = 0.01
  if (t >= 1) return { x: 0, y: 0 }
  const shareOf = (at: number): number => (glide.turning ? at : eased(at))
  const here = alongPath(glide.steps, shareOf(t))
  const ahead = alongPath(glide.steps, shareOf(Math.min(1, t + step)))
  const ms = step * SLIDE_SECONDS * 1000
  return { x: (ahead.x - here.x) / ms, y: (ahead.y - here.y) / ms }
}

const PULL = 0.014

export function turningPath(
  from: { x: number; y: number },
  velocity: { x: number; y: number },
  ms: number,
): Step[] {
  const count = 24
  const at = (t: number, x0: number, v0: number): number =>
    (x0 + (v0 + PULL * x0) * t) * Math.exp(-PULL * t)
  const leftX = at(ms, from.x, velocity.x)
  const leftY = at(ms, from.y, velocity.y)
  const steps: Step[] = []
  for (let i = 0; i <= count; i++) {
    const share = i / count
    const t = share * ms
    steps.push({
      x: at(t, from.x, velocity.x) - share * leftX,
      y: at(t, from.y, velocity.y) - share * leftY,
      at: share,
    })
  }
  return steps
}

const glides = new WeakMap<HTMLElement, Glide>()

export const glideOf = (element: HTMLElement): Step[] | null => glides.get(element)?.steps ?? null

const standingAt = (glide: Glide): { x: number; y: number } =>
  alongPath(glide.steps, glide.turning ? progressOf(glide) : eased(progressOf(glide)))

const settle = (element: HTMLElement): void => {
  const glide = glides.get(element)
  if (!glide) return
  glide.animation?.cancel()
  if (glide.fallback) clearTimeout(glide.fallback)
  glides.delete(element)
  element.classList.remove('gliding')
}

const slide = (element: HTMLElement, dx: number, dy: number): void => {
  if (!motion) return
  style()
  const held = glides.get(element)
  const ms = SLIDE_SECONDS * 1000
  let steps: Step[]
  if (held) {
    const now = standingAt(held)
    steps = turningPath({ x: dx + now.x, y: dy + now.y }, velocityOf(held), ms)
  } else steps = gridPath(dx, dy)
  const glide: Glide = {
    steps,
    since: performance.now(),
    animation: null,
    fallback: null,
    turning: held !== undefined,
  }
  const done = (): void => {
    if (glides.get(element) === glide) settle(element)
  }
  if (typeof element.animate === 'function') {
    glide.animation = element.animate(
      steps.map((step) => ({ translate: `${step.x}px ${step.y}px`, offset: step.at })),
      { duration: ms, easing: glide.turning ? 'linear' : GLIDE_EASE, fill: 'both' },
    )
    glide.animation.onfinish = done
  } else {
    glide.fallback = setTimeout(done, SLIDE_SECONDS * 1000)
  }
  if (held) settle(element)
  glides.set(element, glide)
  element.classList.add('gliding')
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
    if (this.quiet) return
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
        const coming: IntersectionObserverEntry[] = []
        let above = false
        for (const entry of entries) {
          const target = entry.target as HTMLElement
          if (!target.isConnected) continue
          if (!motion) {
            target.classList.remove('waiting')
            continue
          }
          if (!entry.isIntersecting) {
            if (glides.has(target)) continue
            trace('observer', target, {
              rect: Math.round(entry.boundingClientRect.top),
              root: Math.round(entry.rootBounds?.top ?? -1),
              rootBottom: Math.round(entry.rootBounds?.bottom ?? -1),
            })
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
      { root, rootMargin: `${EDGE_SLACK}px 0px` },
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
  private width = NaN
  private height = NaN
  private scale = NaN

  override apply(element: HTMLElement, component: UIComponent, scale: number): void {
    const x = component.getLeft() * scale
    const y = component.getTop() * scale
    const width = component.getWidth() * scale
    const height = component.getHeight() * scale

    if (!this.armed) {
      this.armed = true
      style()
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
    } else {
      if (rehomed.delete(element) && !element.classList.contains('waiting')) {
        rewatch(element)
        if (element.classList.contains('arrived')) {
          const since = Number(element.dataset.since)
          setStyle(element, 'animation-delay', `${since - performance.now()}ms`)
        }
      }
      this.moved(element, component, scale, x, y, width, height)
    }

    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.scale = scale
  }

  private moved(
    element: HTMLElement,
    component: UIComponent,
    scale: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (Number.isNaN(this.x)) return
    anchored(component)
    if (x === this.x && y === this.y + shift) {
      if (y !== this.y) trace('held', element, { fromY: this.y, toY: y, shift })
      return
    }
    if (scale !== this.scale || width !== this.width || height !== this.height) return
    if (element.classList.contains('waiting')) return
    if (touch) return
    if (element.classList.contains('arrived') && performance.now() - Number(element.dataset.since) < BARELY) {
      rearrive(element)
      return
    }
    if (!walk(element, component, scale, this.x, this.y, x, y, height)) rearrive(element, true)
  }
}

let anchor: UIComponent | null = null
let shift = 0
let sendTo: { scroller: HTMLElement; at: number } | null = null

export function holdStill(
  component: UIComponent | null,
  by = 0,
  scroller: HTMLElement | null = null,
  at = 0,
): void {
  anchor = component
  shift = component ? by : 0
  sendTo = component && scroller && by !== 0 ? { scroller, at } : null
  if (component?.element) {
    trace('hold', component.element, {
      by,
      at,
      scrollTop: scroller?.scrollTop,
      scrollHeight: scroller?.scrollHeight,
      client: scroller?.clientHeight,
    })
  }
}

function anchored(component: UIComponent): void {
  if (anchor === component) anchor = null
}

export function passDone(): void {
  anchor = null
  shift = 0
  const send = sendTo
  sendTo = null
  if (send) {
    const before = send.scroller.scrollTop
    send.scroller.scrollTop = send.at
    trace('scroll', send.scroller, {
      wanted: send.at,
      before,
      after: send.scroller.scrollTop,
      scrollHeight: send.scroller.scrollHeight,
      client: send.scroller.clientHeight,
    })
  }
}

function walk(
  element: HTMLElement,
  component: UIComponent,
  scale: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  height: number,
): boolean {
  const seen = viewOf(component, scale)
  const inView = (at: number, moved = 0): boolean =>
    !seen || (at + height > seen.top + moved - height && at < seen.bottom + moved + height)
  const held = glides.get(element)
  const stoodY = fromY + (held ? standingAt(held).y : 0)
  if (!inView(stoodY, -shift) || !inView(toY)) {
    trace('far', element, { fromY, stoodY, toY, shift, seen })
    return false
  }
  slide(element, fromX - toX, fromY + shift - toY)
  return true
}

export class MoveEffect extends Effect {
  private x = NaN
  private y = NaN
  private width = NaN
  private height = NaN
  private scale = NaN

  override apply(element: HTMLElement, component: UIComponent, scale: number): void {
    const x = component.getLeft() * scale
    const y = component.getTop() * scale
    const width = component.getWidth() * scale
    const height = component.getHeight() * scale
    if (
      !Number.isNaN(this.x) &&
      (x !== this.x || y !== this.y + shift) &&
      scale === this.scale &&
      width === this.width &&
      height === this.height &&
      !touch
    ) {
      style()
      walk(element, component, scale, this.x, this.y, x, y, height)
    }
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.scale = scale
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
    private readonly property: 'height' | 'width' | 'top' | 'left' | 'opacity' | 'background-color',
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
  private where = 'left top'
  private placed = false
  private drawn = NaN

  constructor(
    private readonly out: State<number>,
    colour: Color | State<Color>,
    private readonly side = 3,
    private readonly ends: 'left' | 'both' = 'left',
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
      const arm = (towards: number) =>
        `linear-gradient(${paint}, ${paint}), linear-gradient(${towards}deg, ${wash})`
      this.image = this.ends === 'both' ? `${arm(90)}, ${arm(270)}` : arm(90)
      this.where = this.ends === 'both' ? 'left top, left top, right top, right top' : 'left top'
    }
    setStyle(element, 'background-image', this.image)
    setStyle(element, 'background-position', this.where)
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
    const arm = `${this.side * scale * out}px 100%, ${out * WASH_REACH}% 100%`
    setStyle(element, SIZE, this.ends === 'both' ? `${arm}, ${arm}` : arm)
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
    setStyle(element, 'overflow-anchor', 'none')
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
