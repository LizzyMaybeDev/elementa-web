
import {
  BasicState,
  UIBlock,
  UIContainer,
  UIImage,
  UIText,
  UIWrappedText,
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
import { AFTER_BOX, LayerEffect, OutlineEffect, RiseEffect, leave } from '../elementa/effects'
import type { Palette } from '../theme/palette'
import { pressable } from './shell'

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

  const scrim = new UIBlock(tint(() => withAlpha(palette.mainBackground.get(), 232)))
    .constrain({ width: percent(1), height: percent(1) })
    .childOf(root)
  scrim.onClick = () => {}
  scrim.effect(new LayerEffect(2))

  const dismiss = (): void => {
    leave(scrim.element, false, () => {})
    leave(panel.element, true, () => {
      scrim.detach().dispose()
      scrim.element?.remove()
    })
  }

  const panel = new UIBlock(palette.componentBackground)
    .constrain({
      x: center(),
      y: center(),
      width: atMost(percent(0.94), pixels(340)),
      height: plus(childBasedSize(), pixels(28)),
    })
    .childOf(scrim)
  panel.effect(new OutlineEffect(palette.componentBorder))
  panel.effect(new RiseEffect(0))
  scrim.effect(new RiseEffect(0, false))

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

  new UIText(options.title, { color: palette.textHighlight, scale: 1.4 })
    .constrain({ x: center(), y: options.image ? sibling(8) : pixels(0) })
    .childOf(column)
    .effect(new RiseEffect(arriving++))

  new UIWrappedText(options.body, { color: palette.text, centred: true })
    .constrain({ y: sibling(12), width: percent(1) })
    .childOf(column)
    .effect(new RiseEffect(arriving++))

  const ticks = new BasicState(0)

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
    .constrain({ x: center(), y: sibling(16) })
    .childOf(column)
    .effect(new RiseEffect(arriving++))

  if (options.again) {
    const { first, second } = options.again
    const row = new UIContainer()
      .constrain({ x: center(), y: sibling(10), width: childBasedSize(6), height: pixels(11) })
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

  const tick = setInterval(() => {
    const now = remaining()
    if (now !== left.get()) left.set(now)
    if (now === 0) clearInterval(tick)
  }, 250)
  scrim.onDispose(() => clearInterval(tick))

  return scrim
}
