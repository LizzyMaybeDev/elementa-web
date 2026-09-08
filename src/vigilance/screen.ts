import {
  UIBlock,
  UIContainer,
  UIText,
  UIWrappedText,
  aspect,
  basic,
  center,
  childBasedMaxSize,
  childBasedSize,
  hoverState,
  minus,
  percent,
  pixels,
  plus,
  sibling,
} from '../elementa'
import { BasicState, derived, type State } from '../elementa/state'
import { invalidateLayout } from '../elementa/frame'

import { Animations, eased, tint } from '../elementa/animation'
import { brighter, type Color } from '../elementa/color'
import type { UIComponent } from '../elementa/component'
import {
  LAYERS,
  LayerEffect,
  LightEffect,
  OutlineEffect,
  ScissorEffect,
  TransitionEffect,
} from '../elementa/effects'
import { type Palette, inkOf } from '../theme/palette'
import { METRICS, panelShell, type ShellOptions } from './shell'
import { UIRich } from '../elementa/rich'

const { innerPadding: INNER_PADDING, rowGap: ROW_GAP, textColumnMax: TEXT_COLUMN_MAX } = METRICS
const SWITCH = { width: METRICS.switchWidth, height: METRICS.switchHeight }
const CONTROL_WIDTH = 80
const ROW_HEIGHT = 13

export type Control =
  | { kind: 'switch'; value: () => boolean; onChange: (value: boolean) => void }
  | { kind: 'dropdown'; options: string[]; index: () => number; onChange: (index: number) => void }
  | { kind: 'slider'; value: () => number; onChange: (value: number) => void }
  | { kind: 'button'; label: string; onPress: () => void }

export interface Setting {
  name: string
  description: string
  control: Control
}

export interface Category {
  name: string
  settings: Setting[]
}

export interface SettingsConfig {
  title: string
  categories: Category[]
}

function anchored(component: UIComponent, width: number, height: number): UIComponent {
  return component.constrain({
    x: pixels(INNER_PADDING, true),
    y: center(),
    width: pixels(width),
    height: pixels(height),
  })
}

export function switchControl(palette: Palette, spec: Extract<Control, { kind: 'switch' }>): UIComponent {
  const root = anchored(new UIBlock(), SWITCH.width, SWITCH.height)
  const over = hoverState(root)

  const lift = (slot: State<Color>): Color => (over.get() ? brighter(slot.get()) : slot.get())

  root.setColor(derived(() => lift(spec.value() ? palette.primary : palette.text)))
  root.effect(new TransitionEffect('background-color', 0.25, 'ease-out'))

  const knob = new UIBlock(derived(() => lift(palette.componentBackground)))
    .constrain({
      x: pixels(derived(() => (spec.value() ? SWITCH.width - SWITCH.height + 1 : 1))),
      y: center(),
      width: pixels(SWITCH.height - 2),
      height: minus(percent(1), pixels(2)),
    })
    .childOf(root)

  knob.effect(new TransitionEffect('left', 0.5, 'cubic-bezier(0.16, 1, 0.3, 1)'))
  knob.effect(new TransitionEffect('background-color', 0.25, 'ease-out'))

  root.onClick = () => {
    spec.onChange(!spec.value())

    invalidateLayout()
  }
  return root
}

export function dropdownControl(
  palette: Palette,
  spec: Extract<Control, { kind: 'dropdown' }>,
): UIComponent {
  const open = new BasicState(false)

  const listHeight = derived(() => (open.get() ? spec.options.length * ROW_HEIGHT : 0))

  const root = new UIContainer().constrain({
    x: pixels(INNER_PADDING, true),
    y: center(),
    width: pixels(CONTROL_WIDTH),
    height: pixels(derived(() => 15 + (open.get() ? spec.options.length * ROW_HEIGHT + 2 : 0))),
  })

  root.sealed = true

  const lifted = new BasicState(false)
  let lowering: ReturnType<typeof setTimeout> | undefined
  root.onDispose(open.onSetValue((is) => {
    clearTimeout(lowering)
    if (is) lifted.set(true)
    else lowering = setTimeout(() => lifted.set(false), 320)
  }))
  root.onDispose(() => clearTimeout(lowering))
  root.effect(new LayerEffect(derived(() => (lifted.get() ? LAYERS.dropdown : 0))))

  const head = new UIBlock().constrain({ width: percent(1), height: pixels(15) }).childOf(root)
  const headHovered = hoverState(head)
  head.setColor(tint(() =>
      (headHovered.get() ? palette.componentHighlight : palette.componentBackground).get(),
    ),
  )
  head.effect(new OutlineEffect(palette.componentBorder))

  new UIText(derived(() => spec.options[spec.index() % spec.options.length]), { color: palette.text })
    .constrain({ x: pixels(6), y: center() })
    .childOf(head)

  new UIText(derived(() => (open.get() ? '^' : 'v')), { color: palette.textDisabled })
    .constrain({ x: pixels(6, true), y: center() })
    .childOf(head)

  head.onClick = () => open.set(!open.get())

  const outside = (event: PointerEvent): void => {
    const inside = root.element?.contains(event.target as Node)
    if (inside) return

    fold.skip()
    clearTimeout(lowering)
    open.set(false)
    lifted.set(false)
  }
  root.onDispose(
    open.onSetValue((is) => {
      if (is) document.addEventListener('pointerdown', outside, { capture: true })
      else document.removeEventListener('pointerdown', outside, { capture: true })
    }),
  )
  root.onDispose(() => document.removeEventListener('pointerdown', outside, { capture: true }))

  const list = new UIBlock(palette.componentBackground)
    .constrain({ y: sibling(2), width: percent(1), height: pixels(listHeight) })
    .childOf(root)
  list.effect(new OutlineEffect(palette.componentBorder))
  list.effect(new ScissorEffect())
  const fold = new TransitionEffect('height', 0.3)
  list.effect(fold)

  spec.options.forEach((option, index) => {
    const row = new UIBlock()
      .constrain({ y: sibling(0), width: percent(1), height: pixels(ROW_HEIGHT) })
      .childOf(list)
    const hovered = hoverState(row)
    row.setColor(tint(() =>
        hovered.get()
          ? palette.componentHighlight.get()
          : { ...palette.componentBackground.get(), a: 0 },
      ),
    )

    new UIText(option, {
      color: tint(() => (spec.index() === index ? palette.textActive : palette.text).get()),
    })
      .constrain({ x: pixels(6), y: center() })
      .childOf(row)

    row.onClick = () => {
      spec.onChange(index)
      open.set(false)
      invalidateLayout()
    }
  })

  return root
}

const SLIDER = { shut: 60, open: 85, height: 12 }

function sliderControl(
  palette: Palette,
  spec: Extract<Control, { kind: 'slider' }>,
  over: State<boolean>,
): UIComponent {

  const held = new BasicState(false)
  const wide = eased(() => (over.get() || held.get() ? SLIDER.open : SLIDER.shut), {
    seconds: 0.25,
    easing: Animations.OUT_EXP,
  })

  const root = new UIContainer().constrain({
    x: pixels(INNER_PADDING, true),
    y: center(),
    width: pixels(wide),
    height: pixels(SLIDER.height),
  })

  const inset = SLIDER.height * 0.75
  const trough = new UIContainer()
    .constrain({
      x: pixels(1 + inset),
      y: center(),
      width: minus(percent(1), pixels(2 + SLIDER.height * 1.5)),
      height: percent(0.5),
    })
    .childOf(root)
  trough.effect(new OutlineEffect(palette.componentBorder))

  const lit = tint(() => (over.get() ? brighter(palette.primary.get()) : palette.primary.get()))
  const filled = new UIBlock(lit)
    .constrain({ width: percent(derived(spec.value)), height: percent(1) })
    .childOf(trough)

  const grab = new UIBlock(lit)
    .constrain({
      x: basic(() => filled.getRight() - SLIDER.height / 2),
      y: center(),
      width: aspect(1),
      height: percent(1),
    })
    .childOf(root)
  grab.effect(new OutlineEffect(palette.textHighlight))

  root.onDrag = ({ x }) => {
    held.set(true)
    const along = trough.getLeft() - root.getLeft()
    spec.onChange(Math.max(0, Math.min(1, (x - along) / Math.max(1, trough.getWidth()))))
    invalidateLayout()
  }
  root.onDragEnd = () => held.set(false)
  return root
}

function buttonControl(palette: Palette, spec: Extract<Control, { kind: 'button' }>): UIComponent {
  const root = anchored(new UIBlock(), CONTROL_WIDTH, 15)
  const hovered = hoverState(root)
  root.setColor(tint(() => (hovered.get() ? palette.buttonHighlight : palette.button).get()))
  root.effect(new OutlineEffect(palette.componentBorder))

  new UIText(spec.label, { color: palette.textHighlight })
    .constrain({ x: center(), y: center() })
    .childOf(root)

  root.onClick = spec.onPress
  return root
}

function control(palette: Palette, spec: Control, over: State<boolean>): UIComponent {
  switch (spec.kind) {
    case 'switch':
      return switchControl(palette, spec)
    case 'dropdown':
      return dropdownControl(palette, spec)
    case 'slider':
      return sliderControl(palette, spec, over)
    case 'button':
      return buttonControl(palette, spec)
  }
}

function settingRow(palette: Palette, setting: Setting): UIComponent {
  const root = new UIContainer().constrain({
    y: sibling(ROW_GAP),
    width: percent(1),
    height: plus(childBasedMaxSize(), pixels(2)),
  })

  const box = new UIBlock(palette.componentBackground)
    .constrain({
      x: pixels(1),
      y: pixels(1),
      width: minus(percent(1), pixels(2)),
      height: plus(childBasedMaxSize(), pixels(INNER_PADDING)),
    })
    .childOf(root)

  box.effect(new LightEffect(palette.textHighlight))
  const over = hoverState(box)
  box.effect(new OutlineEffect(palette.componentBorder))

  const text = new UIContainer()
    .constrain({
      x: pixels(INNER_PADDING),
      y: pixels(INNER_PADDING),
      width: basic((c) =>
        Math.max(
          60,
          Math.min(
            TEXT_COLUMN_MAX,
            (c.parent?.getWidth() ?? 0) - INNER_PADDING * 2 - CONTROL_WIDTH - 10,
          ),
        ),
      ),
      height: plus(childBasedSize(3), pixels(INNER_PADDING)),
    })
    .childOf(box)

  new UIRich(inkOf(palette)(setting.name), { colour: palette.textHighlight })
    .constrain({ y: sibling(0) })
    .childOf(text)

  new UIWrappedText(setting.description, { color: palette.text })
    .constrain({ y: sibling(3), width: percent(1) })
    .childOf(text)

  control(palette, setting.control, over).childOf(box)
  return root
}

const searchable = (setting: { name: string; description: string }): string =>
  `${setting.name} ${setting.description}`
    .replace(/\{[^:{}]*:([^{}]*)\}/g, '$1')
    .replace(/\{[^{}]*\}/g, '')
    .toLowerCase()

export function settingsScreen(
  root: UIComponent,
  palette: Palette,
  config: SettingsConfig,
  shell: Partial<ShellOptions> = {},
): void {
  const selected = new BasicState(0)

  const rows = new UIContainer().constrain({
    x: pixels(10),
    y: pixels(10),
    width: minus(percent(1), pixels(20)),
    height: plus(childBasedSize(), pixels(ROW_GAP * 2)),
  })

  const fill = (): void => {
    rows.clearChildren()
    const query = search?.get().trim().toLowerCase() ?? ''
    const source = query
      ? config.categories.flatMap((c) => c.settings)
      : config.categories[selected.get()].settings

    for (const setting of source) {
      if (query && !searchable(setting).includes(query)) continue
      settingRow(palette, setting).childOf(rows)
    }
  }

  let search: { get: () => string } | undefined
  const shellResult = panelShell(root, palette, {
    title: config.title,
    entries: config.categories.map((c) => c.name),
    selected: () => selected.get(),
    onSelect: (index) => {
      selected.set(index)
      fill()
    },
    ...shell,
  })
  search = shellResult.search
  rows.onDispose(shellResult.search.onSetValue(fill))

  rows.childOf(shellResult.content)
  fill()
}
