
import {
  BasicState,
  UIBlock,
  UIContainer,
  UIText,
  center,
  childBasedSize,
  derived,
  hoverState,
  percent,
  pixels,
  scaled,
  sibling,
} from '../elementa'
import { tint } from '../elementa/animation'
import type { Color } from '../elementa/color'
import type { State } from '../elementa/state'
import { ScissorEffect, TransitionEffect } from '../elementa/effects'
import type { Palette } from '../theme/palette'

export interface FoldOptions {
  title: string | State<string>
  note?: string | State<string>
  tone: State<Color>
  ink?: State<Color>
  open?: boolean
  gap?: number
  onToggle?: (open: boolean) => void
}

export interface Fold {
  bar: UIContainer
  fold: UIContainer
  open: BasicState<boolean>
}

export function foldable(palette: Palette, into: UIContainer, options: FoldOptions): Fold {
  const open = new BasicState(options.open ?? false)

  const bar = new UIContainer()
    .constrain({ y: sibling(options.gap ?? 8), width: percent(1), height: pixels(14) })
    .childOf(into)
  bar.effect(new TransitionEffect('top', 0.25))

  const over = hoverState(bar)
  new UIBlock(tint(() => (over.get() ? palette.componentHighlight : palette.componentBackground).get()))
    .constrain({ width: percent(1), height: percent(1) })
    .childOf(bar)

  new UIText(derived(() => (open.get() ? 'v' : '>')), { color: options.tone, scale: 0.8 })
    .constrain({ x: pixels(2), y: center() })
    .childOf(bar)
  new UIText(options.title, { color: options.ink ?? palette.textDisabled, scale: 0.9 })
    .constrain({ x: pixels(12), y: center() })
    .childOf(bar)
  if (options.note !== undefined) {
    new UIText(options.note, { color: options.tone, scale: 0.8 })
      .constrain({ x: pixels(0, true), y: center() })
      .childOf(bar)
  }

  const fold = new UIContainer()
    .constrain({
      y: sibling(0),
      width: percent(1),
      height: scaled(childBasedSize(), derived(() => (open.get() ? 1 : 0))),
    })
    .childOf(into)
  fold.effect(new ScissorEffect())
  fold.effect(new TransitionEffect('height', 0.25))
  fold.effect(new TransitionEffect('top', 0.25))

  bar.onClick = () => {
    open.set(!open.get())
    options.onToggle?.(open.get())
  }

  return { bar, fold, open }
}
