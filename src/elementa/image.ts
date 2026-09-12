import { UIComponent } from './component'
import { Constraint, type Axis } from './constraints'
import { type Node_, invalidateFor, reader } from './frame'
import { setStyle } from './style'

interface Entry {
  image: HTMLImageElement
  promise: Promise<HTMLImageElement>
  ready: boolean
  drawn: boolean
  bitmap: ImageBitmap | null
  readers: Set<Node_>
}

const looked = (entry: Entry | undefined): void => {
  const who = reader()
  if (who && entry) entry.readers.add(who)
}

const cache = new Map<string, Entry>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const existing = cache.get(src)
  if (existing) return existing.promise

  const image = new Image()
  const entry: Entry = {
    image,
    ready: false,
    drawn: false,
    bitmap: null,
    readers: new Set(),
    promise: new Promise((resolve, reject) => {
      image.onload = () => {
        entry.ready = true
        const done = (): void => {
          entry.drawn = true
          if (entry.readers.size) invalidateFor(entry.readers)
          resolve(image)
        }
        const decode = typeof image.decode === 'function' ? image.decode() : null
        const bitmap =
          typeof createImageBitmap === 'function'
            ? createImageBitmap(image, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).then(
                (made) => {
                  entry.bitmap = made
                },
                () => {},
              )
            : null
        const both = Promise.all([decode, bitmap].filter((one) => one !== null))
        void both.then(done, done)
      }
      image.onerror = () => reject(new Error(`could not load image at ${src}`))
    }),
  }
  cache.set(src, entry)
  image.src = src
  return entry.promise
}

const masks = new Map<string, Promise<string>>()

export function maskedImage(base: string, covers: readonly string[]): Promise<string> {
  if (covers.length === 0) return Promise.resolve(base)
  const key = [base, ...covers].join('\n')
  const held = masks.get(key)
  if (held) return held

  const work = Promise.all([loadImage(base), ...covers.map((cover) => loadImage(cover))])
    .then(([picture, ...sheets]) => {
      const canvas = document.createElement('canvas')
      canvas.width = picture.naturalWidth
      canvas.height = picture.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx || canvas.width === 0 || canvas.height === 0) return base

      ctx.drawImage(picture, 0, 0)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)

      ctx.imageSmoothingEnabled = false
      const keep = new Float32Array(pixels.data.length / 4).fill(1)
      for (const cover of sheets) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(cover, 0, 0, canvas.width, canvas.height)
        const marks = ctx.getImageData(0, 0, canvas.width, canvas.height)
        for (let at = 0; at < keep.length; at++) {
          keep[at] *= (marks.data[at * 4] * marks.data[at * 4 + 3]) / (255 * 255)
        }
      }

      for (let at = 0; at < keep.length; at++) {
        pixels.data[at * 4 + 3] = Math.round(pixels.data[at * 4 + 3] * keep[at])
      }
      ctx.putImageData(pixels, 0, 0)
      return canvas.toDataURL()
    })

    .catch(() => base)

  masks.set(key, work)
  return work
}

export const maskImage = (base: string, mask: string): Promise<string> =>
  maskedImage(base, [mask])

const lit = new Map<string, TexImageSource>()

export function litSheet(texture: string, glow: string | null): TexImageSource | null {
  const key = `${texture}
${glow ?? ''}`
  const held = lit.get(key)
  if (held) return held

  const base = peekPixels(texture)
  const light = glow ? peekPixels(glow) : null
  if (!base || (glow && !light)) return null

  let out: TexImageSource = base
  if (light) {
    const canvas = document.createElement('canvas')
    canvas.width = base.width
    canvas.height = base.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(base, 0, 0)

    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(light, 0, 0, canvas.width, canvas.height)
    out = canvas
  }
  lit.set(key, out)
  return out
}

export const decoded = (src: string): boolean => {
  const entry = cache.get(src)
  looked(entry)
  return entry?.drawn ?? false
}

export function peekImage(src: string): HTMLImageElement | null {
  const entry = cache.get(src)
  looked(entry)
  return entry?.drawn ? entry.image : null
}

export function peekPixels(src: string): ImageBitmap | HTMLImageElement | null {
  const entry = cache.get(src)
  looked(entry)
  if (!entry?.drawn) return null
  return entry.bitmap ?? entry.image
}

export function imageSize(src: string): { width: number; height: number } | null {
  const image = peekImage(src)
  return image ? { width: image.naturalWidth, height: image.naturalHeight } : null
}

export interface ImageOptions {
  fit?: 'contain' | 'cover'

  pixelated?: boolean
}

export class UIImage extends UIComponent {
  override name = 'UIImage'

  readonly fit: 'contain' | 'cover'
  readonly pixelated: boolean
  src: string

  constructor(src: string, options: ImageOptions = {}) {
    super()
    this.src = src
    this.fit = options.fit ?? 'contain'
    this.pixelated = options.pixelated ?? true
    void loadImage(src).catch(() => {})
  }

  setSource(src: string): this {
    if (src === this.src) return this
    this.src = src
    void loadImage(src).catch(() => {})
    this.changed()
    return this
  }

  override paint(element: HTMLElement): void {
    if (this.src && !decoded(this.src) && element.style.backgroundImage) {
      setStyle(element, 'image-rendering', this.pixelated ? 'pixelated' : 'auto')
      return
    }
    setStyle(element, 'background', `center / ${this.fit} no-repeat url(${JSON.stringify(this.src)})`)
    setStyle(element, 'image-rendering', this.pixelated ? 'pixelated' : 'auto')
  }
}

export class ImageAspectConstraint extends Constraint {
  constructor(private readonly source: UIImage | string) {
    super()
  }

  private get src(): string {
    return typeof this.source === 'string' ? this.source : this.source.src
  }

  protected override size(component: UIComponent, axis: Axis): number {
    const natural = imageSize(this.src)
    if (!natural || natural.height === 0) return 0
    const ratio = natural.width / natural.height
    return axis.horizontal ? component.getHeight() * ratio : component.getWidth() / ratio
  }
}

export const imageAspect = (source: UIImage | string) => new ImageAspectConstraint(source)
