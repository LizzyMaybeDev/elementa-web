
import {
  BasicState,
  UIBlock,
  UIContainer,
  UIImage,
  UIText,
  atMost,
  center,
  childBasedSize,
  derived,
  minus,
  percent,
  pixels,
  plus,
  sibling,
} from '../elementa'
import type { UIComponent } from '../elementa/component'
import { tint } from '../elementa/animation'
import { withAlpha } from '../elementa/color'
import { AFTER_BOX, OutlineEffect, RiseEffect } from '../elementa/effects'
import type { Palette } from '../theme/palette'
import { UIRich } from '../elementa/rich'
import { inkOf } from '../theme/palette'
import { pressable } from './shell'
import { dialog } from './dialog'

const WAIT = 4

export interface NoticeOptions {
  title: string
  body: string
  accept: string
  wait?: number
  image?: string
  again?: { first: string; second: string; onDone: () => void }
  since?: number
  onAccept: () => void
}

export function notice(root: UIComponent, palette: Palette, options: NoticeOptions): UIComponent {
  const opened = options.since ?? performance.now()
  const seconds = options.wait ?? WAIT
  const remaining = () => Math.max(0, Math.ceil(seconds - (performance.now() - opened) / 1000))
  const left = new BasicState(remaining())

  const { scrim, panel, dismiss } = dialog(root, palette, {
    width: atMost(percent(0.94), pixels(340)),
    height: plus(childBasedSize(), pixels(28)),
  })

  const column = new UIContainer()
    .constrain({
      x: center(),
      y: pixels(14),
      width: minus(percent(1), pixels(28)),
      height: childBasedSize(),
    })
    .childOf(panel)

  let arriving = AFTER_BOX
  if (options.image) {
    new UIImage(options.image, { pixelated: false })
      .constrain({ x: center(), width: pixels(64), height: pixels(64) })
      .childOf(column)
      .effect(new RiseEffect(arriving++))
  }

  const say = inkOf(palette)
  new UIRich(say(options.title), { colour: palette.textHighlight, scale: 1.5, centred: true }, true)
    .constrain({ y: options.image ? sibling(8) : pixels(0), width: percent(1) })
    .childOf(column)
    .effect(new RiseEffect(arriving++))

  new UIRich(say(options.body), { colour: palette.text, centred: true }, true)
    .constrain({ y: sibling(12), width: percent(1) })
    .childOf(column)
    .effect(new RiseEffect(arriving++))

  const ticks = new BasicState(0)

  if (options.again) {
    const { first, second } = options.again
    const row = new UIContainer()
      .constrain({ x: center(), y: sibling(16), width: childBasedSize(6), height: pixels(11) })
      .childOf(column)

    const box = new UIBlock(palette.mainBackground)
      .constrain({ y: center(), width: pixels(11), height: percent(1) })
      .childOf(row)
    box.effect(new OutlineEffect(palette.componentBorder))
    new UIBlock(
      tint(() => {
        const on = palette.textActive.get()
        return ticks.get() >= 2 ? on : withAlpha(on, 0)
      }),
    )
      .constrain({ x: center(), y: center(), width: pixels(5), height: pixels(5) })
      .childOf(box)

    new UIText(derived(() => (ticks.get() === 0 ? first : second)), {
      scale: 0.8,
      color: palette.textDisabled,
    })
      .constrain({ x: sibling(6), y: center() })
      .childOf(row)

    row.onClick = () => ticks.set(Math.min(2, ticks.get() + 1))
    row.effect(new RiseEffect(arriving++))
  }

  pressable(
    palette,
    derived(() => (left.get() > 0 ? `${options.accept} (${left.get()})` : options.accept)),
    percent(1),
    () => {
      dismiss()
      if (ticks.get() >= 2) options.again?.onDone()
      options.onAccept()
    },
    { enabled: () => left.get() <= 0, scale: 0.8 },
  )
    .constrain({ x: center(), y: sibling(options.again ? 10 : 16) })
    .childOf(column)
    .effect(new RiseEffect(arriving++))

  const tick = setInterval(() => {
    const now = remaining()
    if (now !== left.get()) left.set(now)
    if (now === 0) clearInterval(tick)
  }, 250)
  scrim.onDispose(() => clearInterval(tick))

  return scrim
}

export interface QuestionOptions {
  title: string
  yes: string
  no: string
  onNo: () => void
}

export function question(
  root: UIComponent,
  palette: Palette,
  options: QuestionOptions,
): UIComponent {
  const { scrim, panel, dismiss } = dialog(root, palette, {
    width: atMost(percent(0.94), pixels(260)),
    height: plus(childBasedSize(), pixels(28)),
  })

  const column = new UIContainer()
    .constrain({
      x: center(),
      y: pixels(14),
      width: minus(percent(1), pixels(28)),
      height: childBasedSize(),
    })
    .childOf(panel)

  new UIText(options.title, { color: palette.textHighlight, scale: 1.1 })
    .constrain({ x: center(), y: pixels(0) })
    .childOf(column)
    .effect(new RiseEffect(AFTER_BOX))

  const row = new UIContainer()
    .constrain({ x: center(), y: sibling(14), width: childBasedSize(6), height: pixels(15) })
    .childOf(column)
  row.effect(new RiseEffect(AFTER_BOX + 1))

  pressable(palette, options.yes, 54, dismiss).constrain({ y: pixels(0) }).childOf(row)
  pressable(palette, options.no, 108, () => {
    options.onNo()
    dismiss()
  })
    .constrain({ x: sibling(6), y: pixels(0) })
    .childOf(row)

  return scrim
}
