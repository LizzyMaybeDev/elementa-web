import { UIComponent } from './component'
import { Constraint, type Axis } from './constraints'
import { invalidateLayout } from './frame'
import { setStyle } from './style'

interface Entry {
  image: HTMLImageElement
  promise: Promise<HTMLImageElement>

  ready: boolean

  drawn: boolean
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
    promise: new Promise((resolve, reject) => {
      image.onload = () => {
        entry.ready = true

        const done = (): void => {
          entry.drawn = true
          invalidateLayout()
        }
        const decode = typeof image.decode === 'function' ? image.decode() : null
        if (decode) void decode.then(done, done)
        else done()
        invalidateLayout()
        resolve(image)
      }
      image.onerror = () => reject(new Error(`could not load image at ${src}`))
    }),
  }
  cache.set(src, entry)
  image.src = src
  return entry.promise
}

const masks = new Map<string, Promise<string>>()

export function maskImage(base: string, mask: string): Promise<string> {
  const key = `${base}
${mask}`
  const held = masks.get(key)
  if (held) return held

  const work = Promise.all([loadImage(base), loadImage(mask)])
    .then(([picture, cover]) => {
      const canvas = document.createElement('canvas')
      canvas.width = picture.naturalWidth
      canvas.height = picture.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx || canvas.width === 0 || canvas.height === 0) return base

      ctx.drawImage(picture, 0, 0)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(cover, 0, 0, canvas.width, canvas.height)
      const marks = ctx.getImageData(0, 0, canvas.width, canvas.height)

      for (let at = 0; at < pixels.data.length; at += 4) {
        const keep = (marks.data[at] * marks.data[at + 3]) / (255 * 255)
        pixels.data[at + 3] = Math.round(pixels.data[at + 3] * keep)
      }
      ctx.putImageData(pixels, 0, 0)
      return canvas.toDataURL()
    })

    .catch(() => base)

  masks.set(key, work)
  return work
}

const lit = new Map<string, TexImageSource>()

export function litSheet(texture: string, glow: string | null): TexImageSource | null {
  const key = `${texture}
${glow ?? ''}`
  const held = lit.get(key)
  if (held) return held

  const base = peekImage(texture)
  const light = glow ? peekImage(glow) : null
  if (!base || (glow && !light)) return null

  let out: TexImageSource = base
  if (light) {
    const canvas = document.createElement('canvas')
    canvas.width = base.naturalWidth
    canvas.height = base.naturalHeight
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

export const decoded = (src: string): boolean => cache.get(src)?.drawn ?? false

export function peekImage(src: string): HTMLImageElement | null {
  const entry = cache.get(src)
  return entry?.ready ? entry.image : null
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
    invalidateLayout()
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
