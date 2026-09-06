
import {
  UIBlock,
  UIContainer,
  UIText,
  UIWrappedText,
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
import { BasicState, derived } from '../elementa/state'
import type { AnimateOptions } from '../elementa/animation'
import { Animations, eased, tint } from '../elementa/animation'
import type { UIComponent } from '../elementa/component'
import { OutlineEffect, ScissorEffect } from '../elementa/effects'
import type { Palette } from '../theme/palette'
import { METRICS, panelShell, type ShellOptions } from './shell'

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
  root.setColor(tint(() => (spec.value() ? palette.textActive : palette.componentBorder).get()))

  new UIBlock(palette.componentBackground)
    .constrain({
      x: pixels(derived(() => (spec.value() ? SWITCH.width - SWITCH.height + 1 : 1))),
      y: center(),
      width: pixels(SWITCH.height - 2),
      height: minus(percent(1), pixels(2)),
    })
    .childOf(root)

  root.onClick = () => spec.onChange(!spec.value())
  return root
}

export function dropdownControl(
  palette: Palette,
  spec: Extract<Control, { kind: 'dropdown' }>,
): UIComponent {
  const open = new BasicState(false)

  const grow: AnimateOptions<number> = {
    seconds: 0.35,
    easingFor: (from, to) => (to > from ? Animations.IN_SIN : Animations.OUT_SIN),
  }
  const listHeight = eased(() => (open.get() ? spec.options.length * ROW_HEIGHT : 0), grow)

  const root = new UIContainer().constrain({
    x: pixels(INNER_PADDING, true),
    y: center(),
    width: pixels(CONTROL_WIDTH),
    height: pixels(eased(() => 15 + (open.get() ? spec.options.length * ROW_HEIGHT + 2 : 0), grow)),
  })

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

  const list = new UIBlock(palette.componentBackground)
    .constrain({ y: sibling(2), width: percent(1), height: pixels(listHeight) })
    .childOf(root)
  list.effect(new OutlineEffect(palette.componentBorder))
  list.effect(new ScissorEffect())

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
    }
  })

  return root
}

function sliderControl(palette: Palette, spec: Extract<Control, { kind: 'slider' }>): UIComponent {
  const KNOB = 6
  const root = anchored(new UIContainer(), CONTROL_WIDTH, 11)

  new UIBlock(palette.componentBackground)
    .constrain({ y: center(), width: percent(1), height: pixels(3) })
    .childOf(root)

  new UIBlock(palette.textActive)
    .constrain({ y: center(), width: percent(derived(spec.value)), height: pixels(3) })
    .childOf(root)

  new UIBlock(palette.text)
    .constrain({
      x: pixels(derived(() => spec.value() * (CONTROL_WIDTH - KNOB))),
      y: center(),
      width: pixels(KNOB),
      height: percent(1),
    })
    .childOf(root)

  root.onDrag = ({ x, width }) => {
    const travel = Math.max(1, width - KNOB)
    spec.onChange(Math.max(0, Math.min(1, (x - KNOB / 2) / travel)))
  }
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

function control(palette: Palette, spec: Control): UIComponent {
  switch (spec.kind) {
    case 'switch':
      return switchControl(palette, spec)
    case 'dropdown':
      return dropdownControl(palette, spec)
    case 'slider':
      return sliderControl(palette, spec)
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

  new UIText(setting.name, { color: palette.textHighlight })
    .constrain({ y: sibling(0) })
    .childOf(text)

  new UIWrappedText(setting.description, { color: palette.text })
    .constrain({ y: sibling(3), width: percent(1) })
    .childOf(text)

  control(palette, setting.control).childOf(box)
  return root
}

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
      if (query && !`${setting.name} ${setting.description}`.toLowerCase().includes(query)) continue
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
