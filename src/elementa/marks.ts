import { UIComponent } from './component'
import { type Color, toCss } from './color'
import { ConstantColorConstraint } from './constraints'
import type { State } from './state'
import { setStyle } from './style'

interface Drawn {
  rows: string[]

  drop?: number

  ink?: string
}

export const MARKS = {

  coin: {
    ink: 'blue',
    rows: [
      '..x..',
      '.xxx.',
      'xxxxx',
      '.xxx.',
      '..x..',
    ],
  },

  star: {
    rows: [
      '...x...',
      '..xxx..',
      'xxxxxxx',
      '.xxxxx.',
      '..xxx..',
      '..x.x..',
      '.x...x.',
    ],
    drop: 1,
  },

  key: {
    rows: [
      '.xxx..',
      'x...x.',
      'x...x.',
      '.xxx..',
      '..x...',
      '..xxx.',
      '..x.x.',
    ],
    drop: 1,
  },

  note: {
    rows: [
      '...xxx',
      '...x.x',
      '...x..',
      '...x..',
      '.xxx..',
      'xxxx..',
      '.xx...',
    ],
    drop: 1,
  },

  shirt: {
    rows: [
      'xx...xx',
      'xxxxxxx',
      'xxxxxxx',
      '.xxxxx.',
      '.xxxxx.',
      '.xxxxx.',
      '.xxxxx.',
    ],
    drop: 1,
  },

  face: {
    rows: [
      'xxxxxxx',
      'x.....x',
      'x.x.x.x',
      'x.....x',
      'x.xxx.x',
      'x.....x',
      'xxxxxxx',
    ],
    drop: 1,
  },

  crown: {
    rows: [
      'x..x..x',
      'x.xxx.x',
      'xxxxxxx',
      'xxxxxxx',
      '.xxxxx.',
    ],
  },

  info: {
    rows: [
      '..xx...',
      '.......',
      '.xxx...',
      '..xx...',
      '..xx...',
      '..xx...',
      '.xxxx..',
    ],
    drop: 1,
  },

  tick: {
    rows: [
      '....x',
      '...xx',
      'x.xx.',
      'xxx..',
      '.x...',
    ],
  },

  clock: {
    rows: [
      '.xxx.',
      'x.x.x',
      'x.xxx',
      'x...x',
      '.xxx.',
    ],
  },
} as const satisfies Record<string, Drawn>

export type MarkName = keyof typeof MARKS

export const markWidth = (name: MarkName): number => MARKS[name].rows[0].length

export const markHeight = (name: MarkName): number => MARKS[name].rows.length

export const markDrop = (name: MarkName): number => (MARKS[name] as Drawn).drop ?? 0

export const markInk = (name: MarkName): string | undefined => (MARKS[name] as Drawn).ink

const drawn = new Map<MarkName, string>()

export function wear(element: HTMLElement, name: MarkName): void {
  const picture = markPicture(name)
  setStyle(element, '-webkit-mask-image', picture)
  setStyle(element, 'mask-image', picture)
  setStyle(element, '-webkit-mask-size', '100% 100%')
  setStyle(element, 'mask-size', '100% 100%')
  setStyle(element, '-webkit-mask-repeat', 'no-repeat')
  setStyle(element, 'mask-repeat', 'no-repeat')
}

function markPicture(name: MarkName): string {
  const held = drawn.get(name)
  if (held) return held

  const rows = MARKS[name].rows as readonly string[]
  const wide = rows[0].length
  let boxes = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (row[x] === '.' || row[x] === ' ') {
        x++
        continue
      }
      let run = 1
      while (x + run < row.length && row[x + run] !== '.' && row[x + run] !== ' ') run++
      boxes += `<rect x="${x}" y="${y}" width="${run}" height="1"/>`
      x += run
    }
  })

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wide}" height="${rows.length}"` +
    ` shape-rendering="crispEdges" fill="#000">${boxes}</svg>`
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  drawn.set(name, url)
  return url
}

export class UIMark extends UIComponent {
  override name = 'UIMark'
  override readonly tag = 'div'

  constructor(
    private readonly which: MarkName,
    colour: Color | State<Color>,
  ) {
    super()
    this.color = new ConstantColorConstraint(colour)
  }

  override paint(element: HTMLElement): void {
    wear(element, this.which)
    setStyle(element, 'background-color', toCss(this.getColor()))
  }
}
