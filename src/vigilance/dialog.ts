
import {
  UIBlock,
  UIContainer,
  UIText,
  center,
  derived,
  fill,
  minus,
  percent,
  pixels,
} from '../elementa'
import type { UIComponent } from '../elementa/component'
import type { Constraint } from '../elementa/constraints'
import type { State } from '../elementa/state'
import { withAlpha } from '../elementa/color'
import { LAYERS, LayerEffect, OutlineEffect, RiseEffect, ScrollEffect, leave } from '../elementa/effects'
import type { Palette } from '../theme/palette'
import { pressable } from './shell'

export interface DialogOptions {
  width: Constraint
  height: Constraint
  scrolls?: boolean
  onClose?: () => void
}

export interface Dialog {
  scrim: UIBlock
  panel: UIBlock
  dismiss: () => void
}

const DIM = 232

export function dialog(root: UIComponent, palette: Palette, options: DialogOptions): Dialog {
  const scrim = new UIBlock(derived(() => withAlpha(palette.mainBackground.get(), DIM)))
    .constrain({ width: percent(1), height: percent(1) })
    .childOf(root)
  scrim.onClick = () => {}
  scrim.effect(new LayerEffect(LAYERS.dialog))
  scrim.effect(new RiseEffect(0, false))

  const panel = new UIBlock(palette.componentBackground)
    .constrain({ x: center(), y: center(), width: options.width, height: options.height })
    .childOf(scrim)
  panel.effect(new OutlineEffect(palette.componentBorder))
  if (options.scrolls) panel.effect(new ScrollEffect(0, false))
  panel.effect(new RiseEffect(0))
  panel.sealed = true

  let gone = false
  const dismiss = (): void => {
    if (gone) return
    gone = true
    options.onClose?.()
    leave(scrim.element, false, () => {})
    leave(panel.element, true, () => {
      scrim.detach().dispose()
      scrim.element?.remove()
    })
  }

  return { scrim, panel, dismiss }
}

export const HEAD = 40

export function titled(
  palette: Palette,
  held: Dialog,
  title: string | State<string>,
  subtitle: string | State<string>,
  foot = 10,
): { head: UIContainer; body: UIContainer } {
  const head = new UIContainer()
    .constrain({ x: pixels(12), y: pixels(10), width: minus(percent(1), pixels(24)), height: pixels(HEAD - 14) })
    .childOf(held.panel)
  new UIText(title, { color: palette.textHighlight, scale: 1.1 }).constrain({ y: pixels(0) }).childOf(head)
  new UIText(subtitle, { color: palette.textDisabled, scale: 0.8 }).constrain({ y: pixels(15) }).childOf(head)
  pressable(palette, 'Close', 54, held.dismiss).constrain({ x: pixels(0, true), y: pixels(2) }).childOf(head)

  const body = new UIContainer()
    .constrain({ x: pixels(12), y: pixels(HEAD), width: minus(percent(1), pixels(24)), height: minus(fill(false), pixels(foot)) })
    .childOf(held.panel)
  body.effect(new ScrollEffect(0, false))

  return { head, body }
}
