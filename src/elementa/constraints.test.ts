import { test } from 'vitest'
import assert from 'node:assert/strict'

import { UIComponent, Window } from './component'
import {
  center,
  childBasedMaxSize,
  childBasedSize,
  cram,
  fill,
  minus,
  percent,
  pixels,
  setScaleFactor,
  sibling,
} from './constraints'

setScaleFactor(1)

function root(width = 200, height = 100): Window {
  const window_ = new Window()
  window_.setViewport(width, height)
  return window_
}

function box(parent: UIComponent, width: number, height: number): UIComponent {
  return new UIComponent()
    .constrain({ width: pixels(width), height: pixels(height) })
    .childOf(parent)
}

function layout(window_: Window): void {
  window_.invalidate()
}

test('pixels offsets from the leading edge', () => {
  const w = root()
  const c = box(w, 10, 10).constrain({ x: pixels(12), y: pixels(4) })
  layout(w)
  assert.equal(c.getLeft(), 12)
  assert.equal(c.getTop(), 4)
})

test('pixels with alignOpposite measures from the trailing edge, inset by its own size', () => {
  const w = root(200, 100)
  const c = box(w, 30, 10).constrain({ x: pixels(5, true) })
  layout(w)
  assert.equal(c.getLeft(), 200 - 5 - 30)
})

test('pixels with alignOutside places the component beyond the edge', () => {
  const w = root(200, 100)
  const c = box(w, 30, 10).constrain({ x: pixels(5, true, true) })
  layout(w)
  assert.equal(c.getLeft(), 205)
})

test('percent takes a fraction of the parent', () => {
  const w = root(200, 100)
  const c = box(w, 0, 0).constrain({ width: percent(0.25), height: percent(0.5) })
  layout(w)
  assert.equal(c.getWidth(), 50)
  assert.equal(c.getHeight(), 50)
})

test('center splits the leftover space', () => {
  const w = root(200, 100)
  const c = box(w, 40, 20).constrain({ x: center(), y: center() })
  layout(w)
  assert.equal(c.getLeft(), 80)
  assert.equal(c.getTop(), 40)
})

test('sibling stacks after the previous child, first one flush', () => {
  const w = root()
  const a = box(w, 20, 10).constrain({ x: sibling(4) })
  const b = box(w, 20, 10).constrain({ x: sibling(4) })
  layout(w)
  assert.equal(a.getLeft(), 0)
  assert.equal(b.getLeft(), 24)
})

test('sibling clears the tallest component in the current row', () => {
  const w = root()
  const a = box(w, 20, 10).constrain({ x: pixels(0), y: pixels(0) })
  const b = box(w, 20, 40).constrain({ x: pixels(20), y: pixels(0) })
  const c = box(w, 20, 10).constrain({ y: sibling(0) })
  layout(w)
  assert.equal(a.getTop(), 0)
  assert.equal(b.getTop(), 0)
  assert.equal(c.getTop(), 40)
})

test('cram wraps when the next component would overflow the parent', () => {
  const w = root(100, 100)
  const cells = [0, 1, 2].map(() =>
    box(w, 40, 20).constrain({ x: cram(0), y: cram(0) }),
  )
  layout(w)
  assert.deepEqual(
    cells.map((c) => [c.getLeft(), c.getTop()]),
    [
      [0, 0],
      [40, 0],
      [0, 20],
    ],
  )
})

test('childBasedSize sums children and the gaps between them', () => {
  const w = root()
  const holder = new UIComponent()
    .constrain({ width: childBasedSize(5), height: childBasedMaxSize() })
    .childOf(w)
  box(holder, 20, 10).constrain({ x: sibling(5) })
  box(holder, 30, 40).constrain({ x: sibling(5) })
  layout(w)

  assert.equal(holder.getWidth(), 60)
  assert.equal(holder.getHeight(), 40)
})

test('fill with siblings takes what the others leave', () => {
  const w = root(200, 100)
  box(w, 50, 10)
  const rest = new UIComponent()
    .constrain({ x: sibling(0), width: fill(), height: pixels(10) })
    .childOf(w)
  layout(w)
  assert.equal(rest.getWidth(), 150)
})

test('fill without siblings runs to the parent edge', () => {
  const w = root(200, 100)
  const c = new UIComponent()
    .constrain({ x: pixels(60), width: fill(false), height: pixels(10) })
    .childOf(w)
  layout(w)
  assert.equal(c.getWidth(), 140)
})

test('combined constraints invalidate their operands', () => {
  const w = root(200, 100)
  const c = new UIComponent()
    .constrain({ width: minus(percent(1), pixels(20)), height: pixels(10) })
    .childOf(w)

  layout(w)
  assert.equal(c.getWidth(), 180)

  w.setViewport(400, 100)
  layout(w)
  assert.equal(c.getWidth(), 380)
})

test('a constraint computes once per pass however many times it is read', () => {
  const w = root(200, 100)
  let reads = 0
  const counted = percent(1)
  const original = Reflect.get(counted, 'size') as (...args: unknown[]) => number
  Reflect.set(counted, 'size', (...args: unknown[]) => {
    reads++
    return original.apply(counted, args)
  })

  const c = new UIComponent().constrain({ width: counted, height: pixels(10) }).childOf(w)
  layout(w)
  c.getWidth()
  c.getWidth()
  c.getRight()
  assert.equal(reads, 1)
})
