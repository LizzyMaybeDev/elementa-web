
import { type Color, toCss } from './color'
import { invalidateLayout } from './frame'

const CELL = 8
const COLUMNS = 16
export const LINE_HEIGHT = 9

export interface BitmapFont {
  advance(codePoint: number): number
  measure(text: string): number
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: Color): void
}

function glyphWidths(atlas: HTMLCanvasElement): Uint8Array {
  const ctx = atlas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')

  const { data } = ctx.getImageData(0, 0, atlas.width, atlas.height)
  const widths = new Uint8Array(COLUMNS * COLUMNS)

  for (let index = 0; index < widths.length; index++) {
    const originX = (index % COLUMNS) * CELL
    const originY = Math.floor(index / COLUMNS) * CELL

    let last = -1
    for (let x = CELL - 1; x >= 0 && last < 0; x--) {
      for (let y = 0; y < CELL; y++) {
        if (data[((originY + y) * atlas.width + originX + x) * 4 + 3] !== 0) {
          last = x
          break
        }
      }
    }

    widths[index] = last < 0 ? 3 : last + 1
  }

  return widths
}

export async function loadBitmapFont(src: string): Promise<BitmapFont> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load font atlas at ${src}`))
    img.src = src
  })

  const atlas = document.createElement('canvas')
  atlas.width = image.width
  atlas.height = image.height
  const atlasCtx = atlas.getContext('2d', { willReadFrequently: true })
  if (!atlasCtx) throw new Error('2d context unavailable')
  atlasCtx.drawImage(image, 0, 0)

  const widths = glyphWidths(atlas)

  const scratch = document.createElement('canvas')
  const scratchCtx = scratch.getContext('2d')
  if (!scratchCtx) throw new Error('2d context unavailable')

  const advance = (codePoint: number): number =>
    codePoint < widths.length ? widths[codePoint] + 1 : CELL + 1

  const measure = (text: string): number => {
    let total = 0
    for (const character of text) total += advance(character.codePointAt(0) ?? 0)
    return total
  }

  const draw = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: Color,
  ): void => {
    const width = Math.max(1, measure(text))
    scratch.width = width
    scratch.height = CELL
    scratchCtx.imageSmoothingEnabled = false
    scratchCtx.clearRect(0, 0, width, CELL)

    let cursor = 0
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0
      if (codePoint < widths.length) {
        scratchCtx.drawImage(
          atlas,
          (codePoint % COLUMNS) * CELL,
          Math.floor(codePoint / COLUMNS) * CELL,
          CELL,
          CELL,
          cursor,
          0,
          CELL,
          CELL,
        )
      }
      cursor += advance(codePoint)
    }

    scratchCtx.globalCompositeOperation = 'source-in'
    scratchCtx.fillStyle = toCss(color)
    scratchCtx.fillRect(0, 0, width, CELL)
    scratchCtx.globalCompositeOperation = 'source-over'

    ctx.drawImage(scratch, x, y)
  }

  return { advance, measure, draw }
}

let active: BitmapFont | null = null
let loaded: BitmapFont | null = null
let generation = 0

export const bitmapFont = (): BitmapFont | null => active

export const fontGeneration = (): number => generation

export function setBitmapFontEnabled(enabled: boolean): void {
  active = enabled ? loaded : null
  generation++
  invalidateLayout()
}

export async function installBitmapFont(src: string): Promise<void> {
  try {
    loaded = await loadBitmapFont(src)
    active = loaded
  } catch {
    active = null
  }
  generation++
  invalidateLayout()
}
