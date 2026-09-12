let owed = true
let scrolled = false
let awakeUntil = 0
let muted = false

export const islands = new Set<object>()

export const awake = new Set<object>()

let held: (() => void)[] = []
let fallback = 0
export const later = (write: () => void): void => {
  held.push(write)
  if (fallback === 0 && typeof requestAnimationFrame === 'function') {
    fallback = requestAnimationFrame(() => {
      fallback = 0
      flushLater()
    })
  }
}

export function flushLater(): void {
  if (held.length === 0) return
  const writes = held
  held = []
  for (const write of writes) write()
}

export const laterStill = (write: () => void): void => later(() => later(write))

export let blame: ((why: string) => void) | null = null
export const setBlame = (to: ((why: string) => void) | null): void => {
  blame = to
}

let everything = true

export const invalidateLayout = (): void => {
  if (muted) return
  if (blame && !owed) blame(new Error().stack ?? '')
  owed = true
  everything = true
}

export const invalidateSome = (): void => {
  if (muted) return
  if (blame && !owed) blame(new Error().stack ?? '')
  owed = true
}

export function takeEverything(): boolean {
  const held = everything
  everything = false
  return held
}

export function building<T>(run: () => T, name = ''): T {
  const was = muted
  muted = true
  const began = watching ? performance.now() : 0
  try {
    return run()
  } finally {
    muted = was
    if (watching) watching(name, performance.now() - began)
  }
}

let watching: ((name: string, ms: number) => void) | null = null
export const setBuildWatch = (to: ((name: string, ms: number) => void) | null): void => {
  watching = to
}

export const invalidateScroll = (): void => {
  scrolled = true
}

export interface Node_ {
  parent: Node_ | null
  sealed: boolean
  disposed: boolean
  dirty: boolean
}

let reading: Node_ | null = null

export const setReading = (component: Node_ | null): void => {
  reading = component
}

export const reader = (): Node_ | null => reading

export function invalidateFor(readers: Set<Node_>): void {
  if (readers.size === 0) return
  let whole = false
  for (const node of readers) {
    if (node.disposed) {
      readers.delete(node)
      continue
    }
    node.dirty = true
    let held: Node_ | null = node
    while (held && !held.sealed) held = held.parent
    if (held) islands.add(held)
    else whole = true
  }
  if (whole) invalidateSome()
}

const roused = new Map<object, number>()
const stirred = new Map<Node_, number>()

export function wake(seconds: number): void {
  const until = performance.now() + seconds * 1000
  if (reading) stirred.set(reading, Math.max(stirred.get(reading) ?? 0, until))
  for (let node = reading; node; node = node.parent) {
    if (!node.sealed) continue
    roused.set(node, Math.max(roused.get(node) ?? 0, until))
    return
  }
  if (blame) blame(`wake ${seconds}s\n${new Error().stack ?? ''}`)
  awakeUntil = Math.max(awakeUntil, until)
}

export function rousedNow(now: number): object[] {
  const out: object[] = []
  for (const [island, until] of roused) {
    if (until <= now) roused.delete(island)
    else out.push(island)
  }
  return out
}

let frameBegan = 0
export const frameNow = (): number => frameBegan

type Hook = (scale: number) => boolean
const hooks = new Set<Hook>()
export const beforePass = (hook: Hook): (() => void) => {
  hooks.add(hook)
  return () => hooks.delete(hook)
}
export function runBeforePass(scale: number): boolean {
  let painting = false
  for (const hook of hooks) painting = hook(scale) || painting
  return painting
}

const TURNS_A_FRAME = 2
const waitingTurn: (() => void)[] = []
let turnsFrame = -1
let turnsGiven = 0

const giveTurns = (): void => {
  const frame = frameNow()
  if (frame !== turnsFrame) {
    turnsFrame = frame
    turnsGiven = 0
  }
  while (waitingTurn.length && (frame === 0 || turnsGiven < TURNS_A_FRAME)) {
    turnsGiven++
    waitingTurn.shift()?.()
  }
  if (waitingTurn.length) later(giveTurns)
}

export const turn = (): Promise<void> =>
  new Promise((resolve) => {
    waitingTurn.push(resolve)
    giveTurns()
  })

export function passOwed(now: number): 'layout' | 'scroll' | 'islands' | null {
  frameBegan = now
  for (const [node, until] of stirred) {
    if (until <= now || node.disposed) stirred.delete(node)
    else node.dirty = true
  }
  if (owed || now < awakeUntil) {
    owed = false
    scrolled = false
    return 'layout'
  }
  if (scrolled) {
    scrolled = false
    return 'scroll'
  }
  return roused.size ? 'islands' : null
}
