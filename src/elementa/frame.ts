let owed = true
let scrolled = false
let awakeUntil = 0
let muted = false

export const islands = new Set<object>()

export const invalidateLayout = (): void => {
  if (!muted) owed = true
}

export function building<T>(run: () => T): T {
  const was = muted
  muted = true
  try {
    return run()
  } finally {
    muted = was
  }
}

export const invalidateScroll = (): void => {
  scrolled = true
}

export interface Node_ {
  parent: Node_ | null
  sealed: boolean
  disposed: boolean
}

let reading: Node_ | null = null

export const setReading = (component: Node_ | null): void => {
  reading = component
}

export const reader = (): Node_ | null => reading

export function invalidateFor(readers: Set<Node_>): void {
  if (readers.size === 0) {
    invalidateLayout()
    return
  }
  let whole = false
  for (const node of readers) {
    if (node.disposed) {
      readers.delete(node)
      continue
    }
    let held: Node_ | null = node
    while (held && !held.sealed) held = held.parent
    if (held) islands.add(held)
    else whole = true
  }
  if (whole || readers.size === 0) invalidateLayout()
}

const roused = new Map<object, number>()

export function wake(seconds: number): void {
  const until = performance.now() + seconds * 1000
  for (let node = reading; node; node = node.parent) {
    if (!node.sealed) continue
    roused.set(node, Math.max(roused.get(node) ?? 0, until))
    return
  }
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

export function passOwed(now: number): 'layout' | 'scroll' | 'islands' | null {
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
