import { wake } from './frame'
import { touch } from './device'
import { derived, type State } from './state'
import { type Color, lerp as lerpColor, sameColor } from './color'

export type Easing = (percentComplete: number) => number

const pow = Math.pow

const inExp: Easing = (t) => (t <= 0 ? 0 : pow(2, 10 * (t - 1)))
const outExp: Easing = (t) => (t >= 1 ? 1 : -pow(2, -10 * t) + 1)

export const Animations = {
  LINEAR: (t) => t,

  IN_QUAD: (t) => t * t,
  OUT_QUAD: (t) => -t * (t - 2),
  IN_OUT_QUAD: (t) => {
    const x = t * 2
    return x < 1 ? 0.5 * x * x : -0.5 * ((x - 1) * (x - 3) - 1)
  },

  IN_CUBIC: (t) => pow(t, 3),
  OUT_CUBIC: (t) => pow(t - 1, 3) + 1,
  IN_OUT_CUBIC: (t) => {
    const x = t * 2
    return x < 1 ? 0.5 * pow(x, 3) : 0.5 * (pow(x - 2, 3) + 2)
  },

  IN_QUART: (t) => pow(t, 4),
  OUT_QUART: (t) => -(pow(t - 1, 4) - 1),
  IN_OUT_QUART: (t) => {
    const x = t * 2
    return x < 1 ? 0.5 * pow(x, 4) : -0.5 * (pow(x - 2, 4) - 2)
  },

  IN_QUINT: (t) => pow(t, 5),
  OUT_QUINT: (t) => pow(t - 1, 5) + 1,
  IN_OUT_QUINT: (t) => {
    const x = t * 2
    return x < 1 ? 0.5 * pow(x, 5) : 0.5 * (pow(x - 2, 5) + 2)
  },

  IN_EXP: inExp,
  OUT_EXP: outExp,
  IN_OUT_EXP: (t) => (t < 0.5 ? inExp(t * 2) / 2 : outExp(t * 2 - 1) / 2 + 0.5),

  IN_CIRCULAR: (t) => -(Math.sqrt(1 - t * t) - 1),
  OUT_CIRCULAR: (t) => Math.sqrt(1 - pow(t - 1, 2)),
  IN_OUT_CIRCULAR: (t) => {
    const x = t * 2
    return x < 1 ? -0.5 * (Math.sqrt(1 - x * x) - 1) : 0.5 * (Math.sqrt(1 - pow(x - 2, 2)) + 1)
  },

  IN_SIN: (t) => -Math.cos(t * (Math.PI / 2)) + 1,
  OUT_SIN: (t) => Math.sin(t * (Math.PI / 2)),
  IN_OUT_SIN: (t) => -0.5 * (Math.cos(Math.PI * t) - 1),
} satisfies Record<string, Easing>

export const DEFAULT_EASING = Animations.OUT_EXP
export const DEFAULT_SECONDS = 0.5

export interface AnimateOptions<T = unknown> {
  easing?: Easing
  seconds?: number

  easingFor?: (from: T, to: T) => Easing

  equals?: (a: T, b: T) => boolean
}

export function animated<T>(
  source: State<T>,
  interpolate: (from: T, to: T, t: number) => T,
  options: AnimateOptions<T> = {},
): State<T> {
  const seconds = options.seconds ?? DEFAULT_SECONDS
  const pick = options.easingFor ?? (() => options.easing ?? DEFAULT_EASING)
  const same = options.equals ?? Object.is
  const initial = source.get()

  let easing = pick(initial, initial)
  let target = initial
  let from = initial
  let startedAt = -Infinity

  return {
    get(): T {
      const now = performance.now() / 1000
      const next = source.get()

      if (!same(next, target)) {
        from = read(now)
        easing = pick(from, next)
        target = next
        startedAt = now
        wake(seconds)
      }

      return read(now)
    },
    onSetValue: (listener) => source.onSetValue(listener),
  }

  function read(now: number): T {
    if (seconds <= 0) return target
    const progress = (now - startedAt) / seconds
    if (progress >= 1) return target
    if (progress <= 0) return from
    return interpolate(from, target, easing(progress))
  }
}

export function animatedColor(
  source: State<Color>,
  options: AnimateOptions<Color> = {},
): State<Color> {

  return animated(source, lerpColor, { equals: sameColor, ...options, ...(touch ? { seconds: 0 } : {}) })
}

export const eased = (compute: () => number, options: AnimateOptions<number> = {}): State<number> =>
  animated(derived(compute), (from, to, t) => from + (to - from) * t, options)

export const tint = (compute: () => Color, options?: AnimateOptions<Color>): State<Color> =>
  animatedColor(derived(compute), options)
