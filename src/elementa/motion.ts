
import { touch } from './device'
import { writtenStyle } from './style'

export interface Step {
  x: number
  y: number
  at: number
}

const FASTEST = 1.2
const SLOWEST = 0.16
const EASE = 92
const GATHER = 0.0075
const HOME = 0.4

const FADE_IN = 150
const FADE_OUT = 95
const STAGGER = 60

const WAIT_FOR_MOVERS = 700

const NEARLY = 40
const ARRIVE_FROM = 14
const ASIDE_FROM = 28

export const ARRIVE_MS = 700
export const arrivesAfter = (order: number): number => (motion ? order * STAGGER + ARRIVE_MS : 0)

const CORNER = 0.5
const CORNER_MAX = 28
const ARC_STEPS = 8

export function gridPath(dx: number, dy: number, lead: 'x' | 'y' = 'y'): Step[] {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const r = Math.min(CORNER_MAX, CORNER * Math.min(ax, ay))
  if (r === 0) return [{ x: dx, y: dy, at: 0 }, { x: 0, y: 0, at: 1 }]
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const first = lead === 'y' ? ay - r : ax - r
  const arc = (Math.PI / 2) * r
  const second = lead === 'y' ? ax - r : ay - r
  const length = first + arc + second
  const steps: Step[] = [{ x: dx, y: dy, at: 0 }]
  for (let k = 0; k <= ARC_STEPS; k++) {
    const angle = ((Math.PI / 2) * k) / ARC_STEPS
    steps.push(
      lead === 'y'
        ? { x: dx - sx * r + sx * r * Math.cos(angle), y: sy * r - sy * r * Math.sin(angle), at: (first + r * angle) / length }
        : { x: sx * r - sx * r * Math.sin(angle), y: dy - sy * r + sy * r * Math.cos(angle), at: (first + r * angle) / length },
    )
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

const lengthOf = (steps: Step[]): number => {
  let total = 0
  for (let i = 1; i < steps.length; i++) total += Math.hypot(steps[i].x - steps[i - 1].x, steps[i].y - steps[i - 1].y)
  return total
}

const BRAKE = 0.025

const headingAt = (steps: Step[], length: number, gone: number): { x: number; y: number } => {
  const a = alongPath(steps, length ? Math.max(0, gone - 1) / length : 0)
  const b = alongPath(steps, length ? Math.min(length, gone + 1) / length : 1)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  return { x: dx / d, y: dy / d }
}

interface Going {
  gone: number
  speed: number
  x: number
  y: number
  opacity: number
  hold: number
  turning: boolean
}

export interface Play extends Going {
  steps: Step[]
  length: number
  toOpacity: number
  fades: boolean
  run: Going[]
  played: Animation | null
  born: number
  timer: ReturnType<typeof setTimeout> | null
  then: (() => void) | null
}

const movers = new Map<HTMLElement, Play>()

interface Hold {
  abs: { x: number; y: number }
  home: { x: number; y: number }
  settle: number | null
}
const holds = new WeakMap<HTMLElement, Hold>()

const slippedAway = new WeakSet<HTMLElement>()
export const slipped = (element: HTMLElement): boolean => slippedAway.has(element)

function unhold(element: HTMLElement): void {
  const hold = holds.get(element)
  if (!hold) return
  if (hold.settle !== null) cancelAnimationFrame(hold.settle)
  holds.delete(element)
  const left = writtenStyle(element, 'left')
  const top = writtenStyle(element, 'top')
  if (left !== undefined) element.style.left = left
  if (top !== undefined) element.style.top = top
  element.style.translate = ''
}

const homeOf = (element: HTMLElement): { x: number; y: number } => holds.get(element)?.home ?? { x: 0, y: 0 }

const pxOf = (value: string | undefined): number => Number.parseFloat(value ?? '') || 0

export interface Layout {
  from: { x: number; y: number }
  to: { x: number; y: number }
}

function keepPainted(element: HTMLElement, layout: Layout): void {
  let hold = holds.get(element)
  if (!hold) {
    hold = { abs: { x: layout.from.x, y: layout.from.y }, home: { x: 0, y: 0 }, settle: null }
    holds.set(element, hold)
  } else if (hold.settle !== null) {
    cancelAnimationFrame(hold.settle)
    hold.settle = null
  }
  const parent = { x: layout.to.x - pxOf(writtenStyle(element, 'left')), y: layout.to.y - pxOf(writtenStyle(element, 'top')) }
  element.style.left = `${hold.abs.x - parent.x}px`
  element.style.top = `${hold.abs.y - parent.y}px`
  hold.home = { x: layout.to.x - hold.abs.x, y: layout.to.y - hold.abs.y }
}

function settle(element: HTMLElement, then: (() => void) | null = null): void {
  const hold = holds.get(element)
  if (!hold || hold.settle !== null) {
    then?.()
    return
  }
  const later = (f: () => void): number =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : (setTimeout(f, FRAME) as unknown as number)
  hold.settle = later(() => {
    hold.settle = later(() => {
      hold.settle = null
      if (holds.get(element) !== hold) return
      holds.delete(element)
      if (!element.isConnected) return
      const left = writtenStyle(element, 'left')
      const top = writtenStyle(element, 'top')
      if (left !== undefined) element.style.left = left
      if (top !== undefined) element.style.top = top
      element.style.translate = ''
      then?.()
    })
  })
}

let motion = true
let quiet = false
let frame = 0
let last = 0

const composited = (): boolean =>
  typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'

export const setMotion = (on: boolean): void => {
  motion = on
  if (!on) for (const [element, play] of movers) finish(element, play)
}

export function quietly(build: () => void): void {
  quiet = true
  try {
    build()
  } finally {
    quiet = false
  }
}

const started = (): void => {
  if (composited() || frame || typeof requestAnimationFrame === 'undefined') return
  last = performance.now()
  frame = requestAnimationFrame(tick)
}

function tick(now: number): void {
  frame = 0
  const dt = Math.min(34, Math.max(0, now - last))
  last = now
  advance(dt)
  if (movers.size) frame = requestAnimationFrame(tick)
}

export function step(play: Going & { steps: Step[]; length: number; toOpacity: number }, dt: number): boolean {
  if (play.hold > 0) {
    play.hold -= dt
    return false
  }
  if (play.turning) {
    if (play.speed > 0 && play.gone < play.length) {
      play.speed = Math.max(0, play.speed - BRAKE * dt)
      play.gone = Math.min(play.length, play.gone + play.speed * dt)
      const at = alongPath(play.steps, play.length ? play.gone / play.length : 1)
      play.x = at.x
      play.y = at.y
    }
    if (play.speed === 0 || play.gone >= play.length) {
      play.steps = gridPath(play.x, play.y, 'y')
      play.length = lengthOf(play.steps)
      play.gone = 0
      play.speed = 0
      play.x = play.steps[0].x
      play.y = play.steps[0].y
      play.turning = false
    }
  } else if (play.gone < play.length) {
    const left = play.length - play.gone
    const want = Math.min(FASTEST, Math.max(SLOWEST, left / EASE))
    const change = Math.max(-GATHER * dt, Math.min(GATHER * dt, want - play.speed))
    play.speed += change
    play.gone = Math.min(play.length, play.gone + play.speed * dt)
    if (play.length - play.gone < HOME) play.gone = play.length
    const at = alongPath(play.steps, play.length ? play.gone / play.length : 1)
    play.x = at.x
    play.y = at.y
  }
  if (play.opacity !== play.toOpacity) {
    const tau = play.toOpacity > play.opacity ? FADE_IN : FADE_OUT
    play.opacity += (play.toOpacity - play.opacity) * (1 - Math.exp(-dt / tau))
    if (Math.abs(play.toOpacity - play.opacity) < 0.01) play.opacity = play.toOpacity
  }
  return !play.turning && play.gone >= play.length && play.opacity === play.toOpacity
}

const FRAME = 16
const MARGIN = 1

const going = (play: Going): Going => ({
  gone: play.gone,
  speed: play.speed,
  x: play.x,
  y: play.y,
  opacity: play.opacity,
  hold: play.hold,
  turning: play.turning,
})

const write = (element: HTMLElement, play: Play): void => {
  const home = homeOf(element)
  const x = play.x + home.x
  const y = play.y + home.y
  element.style.translate = x === 0 && y === 0 ? '' : `${x}px ${y}px`
  if (play.fades) element.style.opacity = play.opacity === 1 ? '' : `${play.opacity}`
}

const behind = (): number => {
  const at = typeof document !== 'undefined' ? document.timeline?.currentTime : null
  return typeof at === 'number' ? Math.max(0, performance.now() - at) : 0
}

const frameOf = (play: Play): number => {
  if (!play.played) return 0
  const lag = Math.max(0, Math.min(behind(), performance.now() - play.born))
  const elapsed = Math.max(0, Number(play.played.currentTime ?? 0) + lag)
  return Math.min(play.run.length - 1, Math.floor(elapsed / FRAME))
}

const sync = (play: Play): void => {
  if (play.played && play.run.length) Object.assign(play, going(play.run[frameOf(play)]))
}

const runOn = (play: Play, into: Going[]): void => {
  const ahead = { ...play }
  let done = ahead.gone >= ahead.length && ahead.opacity === ahead.toOpacity && !ahead.turning
  let frames = into.length
  while (!done && frames < 400) {
    done = step(ahead, FRAME)
    into.push(going(ahead))
    frames++
  }
  play.steps = ahead.steps
  play.length = ahead.length
}

const SPAN = 8000

const spanOf = (run: Going[]): number => Math.max(SPAN, (run.length - 1) * FRAME)

const keyframesOf = (run: Going[], fades: boolean, home: { x: number; y: number }): Keyframe[] => {
  const span = spanOf(run)
  const frames = run.map((at, i) => {
    const frame: Keyframe = { translate: `${at.x + home.x}px ${at.y + home.y}px`, offset: (i * FRAME) / span }
    if (fades) frame.opacity = at.opacity
    return frame
  })
  if (frames[frames.length - 1].offset !== 1) frames.push({ ...frames[frames.length - 1], offset: 1 })
  return frames
}

function due(element: HTMLElement, play: Play): void {
  if (play.timer !== null) clearTimeout(play.timer)
  const left = (play.run.length - 1) * FRAME - Number(play.played?.currentTime ?? 0)
  play.timer = setTimeout(
    () => {
      play.timer = null
      if (movers.get(element) !== play || play.played === null) return
      if (finished(play)) finish(element, play)
      else due(element, play)
    },
    Math.max(0, left) + 4,
  )
}

function plan(element: HTMLElement, play: Play, edit: (play: Play) => void): void {
  if (!composited()) {
    edit(play)
    write(element, play)
    started()
    return
  }
  const playing = play.played && play.run.length > 0 && !finished(play)
  if (!playing) {
    unplay(play)
    edit(play)
    play.run = [going(play)]
    runOn(play, play.run)
    if (play.run.length === 1) {
      play.played = null
      finish(element, play)
      return
    }
    play.born = performance.now()
    const first = play.run[0]
    const home = homeOf(element)
    element.style.translate = `${first.x + home.x}px ${first.y + home.y}px`
    if (play.fades) element.style.opacity = String(first.opacity)
    play.played = element.animate(keyframesOf(play.run, play.fades, home), {
      duration: spanOf(play.run),
      easing: 'linear',
      fill: 'both',
    })
    play.played.onfinish = () => {
      if (movers.get(element) === play) finish(element, play)
    }
    due(element, play)
    return
  }
  const keep = Math.min(play.run.length - 1, frameOf(play) + MARGIN)
  if (import.meta.env.DEV) {
    const held = ((globalThis as { __trace?: unknown[] }).__trace ??= [])
    held.push({
      at: Math.round(performance.now()),
      what: 'edit',
      text: element.textContent?.slice(0, 16),
      ct: play.played?.currentTime,
      lag: Math.round(behind()),
      frame: frameOf(play),
      keep,
      had: play.run.length,
      atKeep: { x: Math.round(play.run[keep].x), y: Math.round(play.run[keep].y), speed: +play.run[keep].speed.toFixed(3) },
    })
    if (held.length > 400) held.shift()
  }
  play.run.length = keep + 1
  Object.assign(play, going(play.run[keep]))
  edit(play)
  play.run[keep] = going(play)
  runOn(play, play.run)
  const effect = play.played!.effect as KeyframeEffect
  const span = spanOf(play.run)
  if (span !== effect.getTiming().duration) effect.updateTiming({ duration: span })
  effect.setKeyframes(keyframesOf(play.run, play.fades, homeOf(element)))
  due(element, play)
}

const unplay = (play: Play): void => {
  if (play.timer !== null) clearTimeout(play.timer)
  play.timer = null
  play.played?.cancel()
  play.played = null
}

const finished = (play: Play): boolean =>
  play.played !== null && Number(play.played.currentTime ?? 0) >= (play.run.length - 1) * FRAME

function finish(element: HTMLElement, play: Play): void {
  movers.delete(element)
  element.classList.remove('going')
  const hold = holds.get(element)
  const then = play.then
  play.then = null
  element.style.opacity = play.toOpacity === 0 ? '0' : ''
  if (hold) {
    element.style.translate = `${hold.home.x}px ${hold.home.y}px`
    unplay(play)
    settle(element, then)
  } else {
    unplay(play)
    element.style.translate = ''
    then?.()
  }
}

const newPlay = (): Play => ({
  steps: [{ x: 0, y: 0, at: 0 }, { x: 0, y: 0, at: 1 }],
  length: 0,
  gone: 0,
  speed: 0,
  x: 0,
  y: 0,
  opacity: 1,
  toOpacity: 1,
  hold: 0,
  turning: false,
  fades: false,
  run: [],
  played: null,
  born: 0,
  timer: null,
  then: null,
})

const playOf = (element: HTMLElement): Play => {
  let play = movers.get(element)
  if (!play) {
    play = newPlay()
    if (element.style.opacity === '0') {
      play.opacity = 0
      play.toOpacity = 0
      play.fades = true
    }
    movers.set(element, play)
  } else sync(play)
  return play
}

export const motionOf = (element: HTMLElement): Play | undefined => {
  const play = movers.get(element)
  if (play) sync(play)
  return play
}

export const standing = (element: HTMLElement): { x: number; y: number } => {
  const play = motionOf(element)
  return play ? { x: play.x, y: play.y } : { x: 0, y: 0 }
}

export const moving = (element: HTMLElement): boolean => {
  const play = motionOf(element)
  return play !== undefined && (play.turning || play.gone < play.length)
}

export const leaving = (element: HTMLElement): boolean => movers.get(element)?.then != null

const othersSettleIn = (element: HTMLElement): number => {
  let most = 0
  for (const [other, play] of movers) {
    if (other === element || play.fades || play.run.length === 0) continue
    const end = play.run[play.run.length - 1]
    let near = play.run.length - 1
    while (near > 0 && Math.hypot(play.run[near - 1].x - end.x, play.run[near - 1].y - end.y) < NEARLY) near--
    const left = near * FRAME - Number(play.played?.currentTime ?? 0)
    if (left > most) most = left
  }
  return Math.min(WAIT_FOR_MOVERS, most)
}

export function slipAway(element: HTMLElement, dx: number, dy: number, layout?: Layout): void {
  if (!motion || touch) return
  const play = playOf(element)
  slippedAway.add(element)
  if (layout && composited()) keepPainted(element, layout)
  plan(element, play, (at) => {
    at.x += dx
    at.y += dy
    for (const frame of at.run) {
      frame.x += dx
      frame.y += dy
    }
    const drift = dy === 0 ? (dx > 0 ? -ASIDE_FROM : ASIDE_FROM) : dy > 0 ? -ARRIVE_FROM : ARRIVE_FROM
    at.fades = true
    at.toOpacity = 0
    at.turning = false
    at.steps =
      dy === 0
        ? [{ x: at.x, y: at.y, at: 0 }, { x: at.x + drift, y: at.y, at: 1 }]
        : [{ x: at.x, y: at.y, at: 0 }, { x: at.x, y: at.y + drift, at: 1 }]
    at.length = Math.abs(drift)
    at.gone = 0
    at.speed = 0
  })
}

export function moveFrom(element: HTMLElement, dx: number, dy: number, layout?: Layout): void {
  if (!motion || touch) return
  const play = playOf(element)
  slippedAway.delete(element)
  if (layout && composited()) keepPainted(element, layout)
  plan(element, play, (at) => {
    at.x += dx
    at.y += dy
    for (const frame of at.run) {
      frame.x += dx
      frame.y += dy
    }
    if (at.turning || (at.gone < at.length && at.speed > 0)) {
      at.steps = at.steps.map((step) => ({ x: step.x + dx, y: step.y + dy, at: step.at }))
      const was = headingAt(at.steps, at.length, at.gone)
      const next = gridPath(at.x, at.y, 'y')
      const now = headingAt(next, lengthOf(next), 0)
      if (was.x * now.x + was.y * now.y > 0.99) {
        at.steps = next
        at.length = lengthOf(next)
        at.gone = 0
        at.turning = false
        return
      }
      at.turning = true
      return
    }
    at.steps = gridPath(at.x, at.y, 'y')
    at.length = lengthOf(at.steps)
    at.gone = 0
    at.speed = 0
    at.x = at.steps[0].x
    at.y = at.steps[0].y
  })
}

export type Way = 'above' | 'below' | 'aside' | 'still'

export function arrive(element: HTMLElement, way: Way = 'above', order = 0): void {
  const play = playOf(element)
  const seen = play.fades && play.toOpacity === 0 && play.then !== null ? play.opacity : 0
  if (movers.has(element) && play.fades && play.toOpacity === 1 && play.then === null && play.opacity < 1) return
  play.then = null
  slippedAway.delete(element)
  unhold(element)
  if (!motion || quiet) {
    play.toOpacity = 1
    finish(element, play)
    return
  }
  unplay(play)
  play.run = []
  plan(element, play, (at) => {
    const from =
      way === 'above' ? { x: 0, y: -ARRIVE_FROM } : way === 'below' ? { x: 0, y: ARRIVE_FROM } : way === 'aside' ? { x: ASIDE_FROM, y: 0 } : { x: 0, y: 0 }
    at.fades = true
    at.hold = order * STAGGER + othersSettleIn(element)
    at.opacity = seen
    at.toOpacity = 1
    at.turning = false
    at.steps = [{ x: from.x, y: from.y, at: 0 }, { x: 0, y: 0, at: 1 }]
    at.length = Math.hypot(from.x, from.y)
    at.gone = 0
    at.speed = 0
    at.x = from.x
    at.y = from.y
  })
}

export function hide(element: HTMLElement): void {
  if (!motion || quiet) return
  const play = playOf(element)
  unplay(play)
  play.run = []
  play.then = null
  play.fades = true
  play.opacity = 0
  play.toOpacity = 0
  play.gone = play.length
  play.turning = false
  play.x = 0
  play.y = 0
  element.style.translate = ''
  element.style.opacity = '0'
}

export const hidden = (element: HTMLElement): boolean => {
  const play = movers.get(element)
  return play ? play.toOpacity === 0 && play.then === null : element.style.opacity === '0'
}

export function leave(element: HTMLElement | null, then: () => void): void {
  if (!element || !element.isConnected || !motion) {
    then()
    return
  }
  const play = playOf(element)
  play.then = then
  element.classList.add('going')
  plan(element, play, (at) => {
    at.fades = true
    at.toOpacity = 0
  })
}

export function unleave(element: HTMLElement | null): void {
  if (!element) return
  element.classList.remove('going')
  const play = movers.get(element)
  if (!play || !play.then) return
  if (slippedAway.has(element)) {
    arrive(element, 'aside')
    return
  }
  play.then = null
  sync(play)
  plan(element, play, (at) => {
    at.toOpacity = 1
  })
}

export function reword(element: HTMLElement | null): void {
  if (element) arrive(element, 'aside')
}

export function advance(ms: number): void {
  while (ms > 0) {
    const dt = Math.min(FRAME, ms)
    ms -= dt
    for (const [element, play] of movers) {
      if (step(play, dt)) finish(element, play)
      else write(element, play)
    }
  }
}

export const inMotion = (): unknown[] =>
  [...movers].map(([element, play]) => {
    sync(play)
    return { text: element.textContent?.slice(0, 24) ?? '', ...going(play), frame: frameOf(play), frames: play.run.length }
  })
