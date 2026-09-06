import { test, expect, vi, afterEach } from 'vitest'

import { Animations, animated, animatedColor, tint } from './animation'
import { BasicState } from './state'
import { rgba } from './color'

afterEach(() => vi.restoreAllMocks())

function atTime(ms: number): void {
  vi.spyOn(performance, 'now').mockReturnValue(ms)
}

test('every easing starts at zero and ends at one', () => {
  for (const [name, easing] of Object.entries(Animations)) {
    expect(easing(0), `${name} at 0`).toBeCloseTo(0, 3)
    expect(easing(1), `${name} at 1`).toBeCloseTo(1, 3)
  }
})

test('OUT_EXP front loads its movement', () => {
  expect(Animations.OUT_EXP(0.5)).toBeGreaterThan(0.9)
  expect(Animations.LINEAR(0.5)).toBeCloseTo(0.5, 5)
})

test('an eased state moves toward a new value instead of jumping', () => {
  atTime(0)
  const source = new BasicState(0)
  const eased = animated(source, (from, to, t) => from + (to - from) * t, {
    easing: Animations.LINEAR,
    seconds: 1,
  })

  expect(eased.get()).toBe(0)

  source.set(100)
  atTime(0)
  expect(eased.get()).toBe(0)

  atTime(500)
  expect(eased.get()).toBeCloseTo(50, 1)

  atTime(1000)
  expect(eased.get()).toBe(100)
})

test('a change mid transition eases from where it currently is', () => {
  atTime(0)
  const source = new BasicState(0)
  const eased = animated(source, (from, to, t) => from + (to - from) * t, {
    easing: Animations.LINEAR,
    seconds: 1,
  })

  source.set(100)
  atTime(0)
  eased.get()
  atTime(500)
  expect(eased.get()).toBeCloseTo(50, 1)

  source.set(0)
  expect(eased.get()).toBeCloseTo(50, 1)
  atTime(1000)
  expect(eased.get()).toBeCloseTo(25, 1)
})

test('colours interpolate channel by channel', () => {
  atTime(0)
  const source = new BasicState(rgba(0, 0, 0))
  const eased = animatedColor(source, { easing: Animations.LINEAR, seconds: 1 })

  source.set(rgba(255, 100, 50))
  atTime(0)
  eased.get()
  atTime(500)

  const mid = eased.get()
  expect(mid.r).toBeCloseTo(127.5, 0)
  expect(mid.g).toBeCloseTo(50, 0)
  expect(mid.b).toBeCloseTo(25, 0)
})

test('tint follows a computed value, which is how hover states are bound', () => {
  atTime(0)
  let hovered = false
  const colour = tint(() => (hovered ? rgba(255, 255, 255) : rgba(0, 0, 0)), {
    easing: Animations.LINEAR,
    seconds: 1,
  })

  expect(colour.get().r).toBe(0)

  hovered = true
  atTime(0)
  colour.get()
  atTime(500)
  expect(colour.get().r).toBeCloseTo(127.5, 0)
})
