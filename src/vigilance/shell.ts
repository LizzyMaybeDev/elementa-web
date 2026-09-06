
import {
  UIBlock,
  UIContainer,
  UIText,
  UIWrappedText,
  center,
  childBasedSize,
  fill,
  hoverState,
  atMost,
  scaled,
  minus,
  percent,
  pixels,
  plus,
  sibling,
} from '../elementa'
import type { UIComponent } from '../elementa/component'
import type { Constraint } from '../elementa/constraints'
import type { BasicState, State } from '../elementa/state'
import { Animations, eased, tint } from '../elementa/animation'
import { type Color, lerp } from '../elementa/color'
import { ConstantColorConstraint } from '../elementa/constraints'
import {
  LayerEffect,
  LightEffect,
  OutlineEffect,
  RiseEffect,
  ScissorEffect,
  ScrollEffect,
  ShowEffect,
  scrollMetrics,
} from '../elementa/effects'
import { UITextInput, onUnfocusedType } from '../elementa/input'
import { BasicState as MutableState, derived } from '../elementa/state'
import type { Palette } from '../theme/palette'

export const METRICS = {
  divider: 3,
  titleBar: 30,
  sidebar: 0.25,
  innerPadding: 13,
  rowGap: 8,
  textColumnMax: 364,
  switchWidth: 20,
  switchHeight: 11,
} as const

export const PANEL = { width: 0.85, height: 0.75 }

export const PANEL_MAX = { width: 1040, height: 720 }

const SIDEBAR_MAX = 150

export const CONTROL_INSET = 12
const sidebarWidth = () => atMost(percent(METRICS.sidebar), pixels(SIDEBAR_MAX))

export interface NavGroup {
  label: string
  accent?: keyof Palette
  pulse?: boolean
  off?: string
  children: string[]
}

export class PulsingText extends UIText {
  override get live(): boolean {
    return true
  }
}

const PULSE = 3

const WHEEL = ['tierLegendary', 'tierEpic', 'tierRare', 'tierUncommon'] as const

export const rainbow = (palette: Palette) => (): Color => {
  const turn = ((performance.now() / 1000 / PULSE) % 1) * WHEEL.length
  const at = Math.floor(turn)
  return lerp(
    palette[WHEEL[at % WHEEL.length]].get(),
    palette[WHEEL[(at + 1) % WHEEL.length]].get(),
    turn - at,
  )
}

export const liveColour = (component: UIComponent, colour: () => Color): void => {
  component.color = new ConstantColorConstraint(derived(colour), true)
}

export type NavEntry = string | NavGroup

export interface ShellOptions {
  title: string
  entries: NavEntry[]
  selected: () => number
  onSelect: (index: number) => void
  action?: { label: string; onPress: () => void }
  searchPlaceholder?: string
  size?: { width: number; height: number }
  scrollFade?: number | State<number>
  compact?: boolean
  controls?: (into: UIContainer) => void
  sidebarFooter?: (into: UIContainer) => void
}

export interface Shell {
  content: UIContainer
  search: BasicState<string>
}

export interface PressOptions {
  loud?: boolean
  enabled?: () => boolean
  scale?: number
  height?: number
}

export function pressable(
  palette: Palette,
  label: string | State<string>,
  width: number | Constraint,
  onPress: () => void,
  options: PressOptions = {},
): UIBlock {
  const { loud = false, enabled, scale, height = 15 } = options
  const box = new UIBlock().constrain({
    width: typeof width === 'number' ? pixels(width) : width,
    height: pixels(height),
  })
  const hovered = hoverState(box)
  const open = () => enabled?.() !== false
  box.setColor(
    tint(() =>
      (!open()
        ? palette.componentBackground
        : hovered.get()
          ? palette.buttonHighlight
          : palette.button
      ).get(),
    ),
  )
  box.effect(new OutlineEffect(palette.componentBorder))
  box.effect(new LightEffect(palette.textHighlight))

  const caption = new (loud ? PulsingText : UIText)(label, {
    scale,
    color: tint(() => (open() ? palette.textHighlight : palette.textDisabled).get()),
  })
  if (loud) liveColour(caption, rainbow(palette))
  caption.constrain({ x: center(), y: center() }).childOf(box)

  box.onClick = () => {
    if (open()) onPress()
  }
  return box
}

export function panelShell(root: UIComponent, palette: Palette, options: ShellOptions): Shell {
  const { divider: DIVIDER, titleBar: TITLE_BAR } = METRICS
  const compact = options.compact ?? false
  const size = compact ? { width: 1, height: 1 } : (options.size ?? PANEL)
  const fade = options.scrollFade ?? 20

  const menu = new MutableState(!compact)
  const openness = eased(() => (menu.get() ? 1 : 0), {
    seconds: 0.22,
    easing: Animations.OUT_EXP,
  })
  const drawerWidth = () => scaled(compact ? pixels(SIDEBAR_MAX) : sidebarWidth(), openness)
  const choose = (index: number): void => {
    options.onSelect(index)
    if (compact) menu.set(false)
  }

  new UIBlock(palette.mainBackground)
    .constrain({ width: percent(1), height: percent(1) })
    .childOf(root)

  const container = new UIContainer()
    .constrain({
      x: center(),
      y: center(),
      width: atMost(percent(size.width), pixels(PANEL_MAX.width)),
      height: atMost(percent(size.height), pixels(PANEL_MAX.height)),
    })
    .childOf(root)

  const titleBar = new UIContainer()
    .constrain({ width: percent(1), height: pixels(TITLE_BAR) })
    .childOf(container)
  titleBar.effect(new LayerEffect(1))

  const edge = (x: Constraint = pixels(0)) =>
    new UIBlock(palette.componentHighlight)
      .constrain({ x, width: pixels(DIVIDER), height: percent(1) })
      .childOf(titleBar)

  const strip = (width: Constraint) =>
    new UIBlock(palette.componentBackground)
      .constrain({ x: sibling(0), width, height: percent(1) })
      .childOf(titleBar)

  edge()

  const titleContent = strip(compact ? minus(percent(1), pixels(DIVIDER * 2)) : drawerWidth())
  if (!compact) edge(sibling(0))
  const controlsContent = compact ? titleContent : strip(minus(fill(false), pixels(DIVIDER)))

  edge(pixels(0, true))

  if (compact) {
    pressable(palette, 'Menu', 40, () => menu.set(!menu.get()))
      .constrain({ x: pixels(10), y: center() })
      .childOf(titleContent)
  } else {
    new UIText(options.title, { color: palette.textHighlight })
      .constrain({ x: pixels(10), y: center() })
      .childOf(titleContent)
  }

  if (options.controls) {
    const leading = new UIContainer()
      .constrain({
        x: pixels(CONTROL_INSET),
        y: center(),
        width: childBasedSize(6),
        height: pixels(17),
      })
      .childOf(controlsContent)
    options.controls(leading)
  }

  const right = new UIContainer()
    .constrain({
      x: pixels(10, true),
      y: center(),
      width: childBasedSize(6),
      height: pixels(17),
    })
    .childOf(controlsContent)

  const search = new UIBlock(palette.mainBackground)
    .constrain({
      x: sibling(6),
      width: pixels(compact ? 60 : 110),
      height: percent(1),
    })
    .childOf(right)
  search.effect(new OutlineEffect(palette.componentBorder))

  const input = new UITextInput({
    placeholder: options.searchPlaceholder ?? 'Search...',
  })
  input
    .constrain({
      x: pixels(6),
      y: center(),
      width: minus(percent(1), pixels(12)),
      height: pixels(9),
    })
    .setColor(palette.text)
    .childOf(search)

  search.onClick = () => input.focus()

  const stopTyping = onUnfocusedType((event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      input.focus()
      return true
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return false
    input.focus()
    input.handleKey(event)
    return true
  })
  container.onDispose(stopTyping)
  container.onDispose(() => input.blur())

  if (options.action) {
    pressable(palette, options.action.label, 62, options.action.onPress)
      .constrain({ x: sibling(6), y: center() })
      .childOf(right)
  }

  if (compact) edge(plus(drawerWidth(), pixels(DIVIDER)))

  const bottom = new UIContainer()
    .constrain({ y: sibling(0), width: percent(1), height: fill() })
    .childOf(container)

  const scrollbar = (divider: UIComponent, scroller: UIComponent): void => {
    const metrics = () => {
      const measured = scrollMetrics(scroller.element)
      if (measured.height <= measured.client) return null
      return {
        fraction: measured.client / measured.height,
        offset: measured.top / measured.height,
      }
    }

    const thumb = new UIBlock(palette.scrollbar)
      .constrain({
        y: pixels(derived(() => (metrics()?.offset ?? 0) * divider.getHeight())),
        width: percent(1),
        height: pixels(derived(() => (metrics()?.fraction ?? 0) * divider.getHeight())),
      })
      .childOf(divider)

    divider.dragCursor = 'ns-resize'
    divider.onDrag = ({ y, height }) => {
      const element = scroller.element
      if (!element || height <= 0) return
      const room = element.scrollHeight - element.clientHeight
      if (room <= 0) return
      const held = thumb.getHeight() / 2
      const along = (y - held) / Math.max(1, height - held * 2)
      element.scrollTop = Math.max(0, Math.min(1, along)) * room
    }
  }

  const seam = (x: Constraint = pixels(0)) =>
    new UIBlock(palette.dividerDark)
      .constrain({ x, width: pixels(DIVIDER), height: percent(1) })
      .childOf(bottom)

  seam()

  const sidebar = new UIContainer()
    .constrain({ x: sibling(0), width: drawerWidth(), height: percent(1) })
    .childOf(bottom)
  sidebar.effect(new ScrollEffect(fade, false))

  const middleSeam = seam(sibling(0))
  scrollbar(middleSeam, sidebar)

  const content = new UIContainer()
    .constrain({ x: sibling(0), width: fill(false), height: percent(1) })
    .childOf(bottom)
  content.effect(new ScrollEffect(fade, false))

  scrollbar(seam(pixels(0, true)), content)

  const list = new UIContainer()
    .constrain({
      x: pixels(0),
      y: pixels(8),
      width: percent(1),
      height: fill(false),
    })
    .childOf(sidebar)

  let arriving = 0

  const row = (
    parent: UIComponent,
    text: string,
    accent: keyof Palette | null,
    isSelected: () => boolean,
    onPress: () => void,
    indent = 0,
    pulse = false,
    off?: string,
    order = arriving++,
  ): UIContainer => {
    const hovered = new MutableState(false)

    const label = new UIBlock(
      tint(() =>
        (isSelected()
          ? palette.componentBackgroundHighlight
          : hovered.get()
            ? palette.componentHighlight
            : palette.mainBackground
        ).get(),
      ),
    )
      .constrain({
        y: sibling(0),
        width: percent(1),
        height: plus(childBasedSize(), pixels(8)),
      })
      .childOf(parent)
    label.onHover = (over) => hovered.set(over)
    label.effect(new LightEffect(palette.textHighlight))

    const moving = pulse
    const colour = () => {
      if (off) return palette.textDisabled.get()
      if (accent) return palette[accent].get()
      if (isSelected()) return palette.textActive.get()
      return (hovered.get() ? palette.textHighlight : palette.text).get()
    }
    const caption = new (moving ? PulsingText : UIText)(text, {
      color: tint(colour),
    })
    if (moving) liveColour(caption, rainbow(palette))
    caption.constrain({ x: pixels(10 + indent), y: center() }).childOf(label)
    caption.effect(new RiseEffect(order))

    if (off) {
      const tip = new UIBlock(palette.componentBackground)
        .constrain({
          x: center(),
          y: pixels(derived(() => label.getTop() - sidebar.getTop() + label.getHeight() - 2)),
          width: minus(percent(1), pixels(12)),
          height: plus(childBasedSize(), pixels(8)),
        })
        .childOf(sidebar)
      tip.effect(new OutlineEffect(palette.componentBorder))
      tip.effect(new ShowEffect(hovered))
      new UIWrappedText(off, { scale: 0.85, color: palette.textDisabled })
        .constrain({
          x: center(),
          y: pixels(4),
          width: minus(percent(1), pixels(8)),
        })
        .childOf(tip)
      return label
    }

    label.onClick = onPress
    return label
  }

  const open = new MutableState(-1)
  let leaf = 0

  options.entries.forEach((entry, groupIndex) => {
    if (typeof entry === 'string') {
      const index = leaf++
      row(
        list,
        entry,
        null,
        () => options.selected() === index,
        () => choose(index),
      )
      return
    }

    if (entry.children.length === 0) {
      const index = leaf++
      row(
        list,
        entry.label,
        entry.accent ?? null,
        () => options.selected() === index,
        () => choose(index),
        0,
        entry.pulse,
        entry.off,
      )
      new UIBlock(palette.componentHighlight)
        .constrain({ y: sibling(0), width: percent(1), height: pixels(1) })
        .childOf(list)
      return
    }

    const first = leaf
    if (options.selected() >= first && options.selected() < first + entry.children.length) {
      open.set(groupIndex)
    }

    row(
      list,
      entry.label,
      entry.accent ?? null,
      () => options.selected() >= first && options.selected() < first + entry.children.length,
      () => {
        open.set(groupIndex)
        choose(first)
      },
    )

    new UIBlock(palette.componentHighlight)
      .constrain({ y: sibling(0), width: percent(1), height: pixels(1) })
      .childOf(list)

    const openness = eased(() => (open.get() === groupIndex ? 1 : 0), {
      seconds: 0.22,
      easing: Animations.OUT_EXP,
    })
    const drawer = new UIContainer()
      .constrain({
        y: sibling(0),
        width: percent(1),
        height: scaled(childBasedSize(), openness),
      })
      .childOf(list)
    drawer.effect(new ScissorEffect())

    const heading = arriving - 1
    entry.children.forEach((child, at) => {
      const index = leaf++
      row(
        drawer,
        child,
        null,
        () => options.selected() === index,
        () => choose(index),
        8,
        false,
        undefined,
        heading + 1 + at,
      )
    })
  })

  if (options.sidebarFooter) {
    const footer = new UIContainer()
      .constrain({ y: sibling(0), width: percent(1), height: childBasedSize() })
      .childOf(list)
    footer.effect(new RiseEffect(arriving + 1))
    options.sidebarFooter(footer)
  }

  return { content, search: input.value }
}
