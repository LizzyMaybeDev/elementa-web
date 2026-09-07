import {
  UIBlock,
  UIContainer,
  UIText,
  UIWrappedText,
  basic,
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
import { tint } from '../elementa/animation'
import { type Color, lerp, toCss, withAlpha } from '../elementa/color'
import { ConstantColorConstraint } from '../elementa/constraints'
import {
  bloom,
  DrawerEffect,
  EdgeEffect,
  LAYERS,
  LayerEffect,
  LightEffect,
  OutlineEffect,
  RiseEffect,
  ScissorEffect,
  ScrollEffect,
  ShowEffect,
  TransitionEffect,
  TurnEffect,
  scrollMetrics,
} from '../elementa/effects'
import { UITextInput, onUnfocusedType } from '../elementa/input'
import type { MarkName } from '../elementa/marks'
import { type Piece, UIRich } from '../elementa/rich'
import { inkOf } from '../theme/palette'
import { BasicState as MutableState, derived, toState } from '../elementa/state'
import { measureText } from '../elementa/font'
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
  label: string | State<string>
  accent?: keyof Palette
  pulse?: boolean
  off?: string

  mark?: MarkName
  children: string[]

  pointsTo?: number
}

const SLIDE = 4

const HELD = 0.4

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

  actions?: { label: string | State<string>; onPress: () => void; accent?: State<Color> }[]

  opens?: (close: () => void) => () => void
  searchPlaceholder?: string

  onSubmit?: () => void

  searchable?: boolean
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

  accent?: State<Color>
}

export function pressable(
  palette: Palette,
  label: string | State<string>,
  width: number | Constraint,
  onPress: () => void,
  options: PressOptions = {},
): UIBlock {
  const { loud = false, enabled, scale, height = 15, accent } = options
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
  box.effect(new OutlineEffect(accent ?? palette.componentBorder))

  box.sealed = true
  box.effect(new LightEffect(accent ?? palette.textHighlight))

  const wanted = scale ?? 1
  const held = toState(label)
  const fitted = derived(() => {
    const room = box.getWidth() - 8
    if (room <= 0) return wanted
    const drawn = measureText(held.get(), wanted)
    return drawn <= room ? wanted : Math.max(wanted * 0.6, (room / drawn) * wanted)
  })

  const caption = new UIText(label, {
    scale: fitted,
    color: tint(() => (!open() ? palette.textDisabled : (accent ?? palette.textHighlight)).get()),
  })
  if (loud) liveColour(caption, rainbow(palette))
  caption.constrain({ x: center(), y: center() }).childOf(box)

  box.onPress = (event) => {
    if (!open()) return
    bloom(box.element, event, toCss(withAlpha((accent ?? palette.textHighlight).get(), 90)))
  }
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

  const drawerWidth = () => (compact ? pixels(SIDEBAR_MAX) : sidebarWidth())
  const drawer = (component: UIComponent): void => {
    if (compact) component.effect(new DrawerEffect(menu, SIDEBAR_MAX + DIVIDER * 2))
  }
  let leaveMenu: (() => void) | null = null

  const shut = (): void => {
    leaveMenu?.()
    leaveMenu = null
    menu.set(false)
  }
  const toggle = (): void => {
    if (menu.get()) {
      shut()
      return
    }
    menu.set(true)
    leaveMenu = (options.opens ?? ((close) => close))(() => menu.set(false))
  }

  const choose = (index: number): void => {
    options.onSelect(index)
    if (compact) shut()
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
  titleBar.effect(new LayerEffect(LAYERS.titleBar))

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
    pressable(palette, 'Menu', 40, toggle)
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

  const input = new UITextInput({
    placeholder: options.searchPlaceholder ?? 'Search...',
  })

  if (options.searchable !== false) {
    const search = new UIBlock(palette.mainBackground)
      .constrain({
        x: sibling(6),

        width: basic(() => Math.min(compact ? 60 : 90, Math.max(50, controlsContent.getWidth() * 0.28))),
        height: percent(1),
      })
      .childOf(right)
    search.effect(new OutlineEffect(palette.componentBorder))

    search.onClick = () => input.focus()

    input
      .constrain({
        x: pixels(6),
        y: center(),
        width: minus(percent(1), pixels(12)),
        height: pixels(9),
      })
      .setColor(palette.text)
      .childOf(search)
    input.onSubmit = () => options.onSubmit?.()

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
  }

  for (const action of options.actions ?? []) {
    pressable(palette, action.label, 62, action.onPress, { accent: action.accent })
      .constrain({ x: sibling(6), y: center() })
      .childOf(right)
  }

  if (compact) drawer(edge(plus(drawerWidth(), pixels(DIVIDER))))

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
    thumb.scrollBound = true

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

  const sidebar = (compact ? new UIBlock(palette.mainBackground) : new UIContainer())
    .constrain({ x: sibling(0), width: drawerWidth(), height: percent(1) })
    .childOf(bottom)
  sidebar.effect(new ScrollEffect(fade, false, palette.mainBackground))

  const middleSeam = seam(sibling(0))
  scrollbar(middleSeam, sidebar)

  if (compact) {
    sidebar.effect(new LayerEffect(1))
    middleSeam.effect(new LayerEffect(1))
    drawer(sidebar)
    drawer(middleSeam)
  }

  const content = new UIContainer()
    .constrain({
      x: compact ? pixels(DIVIDER) : sibling(0),
      width: compact ? minus(percent(1), pixels(DIVIDER * 2)) : fill(false),
      height: percent(1),
    })
    .childOf(bottom)
  content.effect(new ScrollEffect(fade, false, palette.mainBackground))

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

  const say = inkOf(palette)

  const row = (
    parent: UIComponent,
    text: string | State<string>,
    accent: keyof Palette | null,
    isSelected: () => boolean,
    onPress: () => void,
    indent = 0,
    pulse = false,
    off?: string,
    order = arriving++,
    mark?: MarkName,

    lit = (): number => (isSelected() ? 1 : 0),
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

    label.effect(
      new EdgeEffect(derived(lit), accent ? palette[accent] : palette.textActive, DIVIDER),
    )

    label.sealed = true

    const moving = pulse
    const colour = () => {
      if (off) return palette.textDisabled.get()
      if (accent) return palette[accent].get()
      if (isSelected()) return palette.textActive.get()
      return (hovered.get() ? palette.textHighlight : palette.text).get()
    }

    const said = toState(text)
    let held = { words: '', pieces: [] as Piece[] }
    const pieces = derived(() => {
      const words = said.get()
      if (words !== held.words) {
        held = { words, pieces: say(mark ? `${words} {${mark}}` : words) }
      }
      return held.pieces
    })

    const caption = new UIRich(pieces, { colour: tint(colour) })
    if (moving) liveColour(caption, rainbow(palette))

    caption
      .constrain({
        x: pixels(derived(() => 10 + indent + (isSelected() || hovered.get() ? SLIDE : 0))),
        y: center(),
      })
      .childOf(label)
    caption.effect(new TransitionEffect('left', 0.18))
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

      let showing: ReturnType<typeof setTimeout> | undefined
      label.onClick = () => {
        hovered.set(true)
        clearTimeout(showing)
        showing = setTimeout(() => hovered.set(false), 2000)
      }
      label.onDispose(() => clearTimeout(showing))
      return label
    }

    label.onPress = (event) => {
      bloom(label.element, event, toCss(withAlpha(palette.textHighlight.get(), 70)))
    }
    label.onClick = onPress
    return label
  }

  const open = new MutableState(-1)
  let leaf = 0

  const rows: UIContainer[] = []

  options.entries.forEach((entry, groupIndex) => {
    if (typeof entry === 'string') {
      const index = leaf++
      rows[groupIndex] = row(
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
      rows[groupIndex] = row(
        list,
        entry.label,
        entry.accent ?? null,
        () => options.selected() === index,
        () => choose(index),
        0,
        entry.pulse,
        entry.off,
        arriving++,
        entry.mark,
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
        const inside =
          options.selected() >= first && options.selected() < first + entry.children.length

        if (inside && open.get() === groupIndex) {
          open.set(-1)
          return
        }
        open.set(groupIndex)
        if (!inside) choose(first)
      },
      0,
      entry.pulse,
      entry.off,
      arriving++,
      entry.mark,

      () => {
        const inside =
          options.selected() >= first && options.selected() < first + entry.children.length
        if (!inside) return 0
        return open.get() === groupIndex ? HELD : 1
      },
    )

    new UIBlock(palette.componentHighlight)
      .constrain({ y: sibling(0), width: percent(1), height: pixels(1) })
      .childOf(list)

    const drawer = new UIContainer()
      .constrain({
        y: sibling(0),
        width: percent(1),
        height: scaled(childBasedSize(), derived(() => (open.get() === groupIndex ? 1 : 0))),
      })
      .childOf(list)
    drawer.effect(new ScissorEffect())
    drawer.effect(new TransitionEffect('height', 0.22))

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

  const arrows = options.entries
    .map((entry, at) => (typeof entry === 'string' || entry.pointsTo === undefined ? null : { at, to: entry.pointsTo }))
    .filter((held): held is { at: number; to: number } => held !== null)
    .map((held) => ({ ...held, top: Math.min(held.at, held.to), bottom: Math.max(held.at, held.to) }))
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom)
  const lanes: number[] = []
  for (const held of arrows) {
    let lane = lanes.findIndex((busyUntil) => busyUntil < held.top)
    if (lane < 0) lane = lanes.push(0) - 1
    lanes[lane] = held.bottom
    const from = rows[held.at]
    const to = rows[held.to]
    if (!from || !to) continue
    const x = 2 + (lane % 4) * 2
    const lit = () => {
      const chosen = options.selected()
      return chosen === held.at || chosen === held.to
    }
    const colour = tint(() => (lit() ? palette.tierLegendary.get() : withAlpha(palette.textDisabled.get(), 70)))
    const mid = (row_: UIContainer) => row_.getTop() - list.getTop() + row_.getHeight() / 2
    const top = () => Math.min(mid(from), mid(to))
    const bottom = () => Math.max(mid(from), mid(to))
    new UIBlock(colour)
      .constrain({
        x: pixels(x),
        y: pixels(derived(top)),
        width: pixels(1),
        height: pixels(derived(() => Math.max(1, bottom() - top()))),
      })
      .childOf(list)

    new UIBlock(colour)
      .constrain({ x: pixels(x), y: pixels(derived(() => mid(from))), width: pixels(4), height: pixels(1) })
      .childOf(list)
    const head = new UIBlock(colour).constrain({
      x: pixels(x - 1),
      y: pixels(derived(() => mid(to) - 1)),
      width: pixels(3),
      height: pixels(3),
    })
    head.effect(new TurnEffect())
    head.childOf(list)
  }

  for (const child of list.children) child.effect(new TransitionEffect('top', 0.22))

  return { content, search: input.value }
}
