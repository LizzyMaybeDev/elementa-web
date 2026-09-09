type Written = Map<string, string>

const written = new WeakMap<HTMLElement, Written>()

export function setStyle(element: HTMLElement, property: string, value: string): void {
  let cache = written.get(element)
  if (!cache) {
    cache = new Map()
    written.set(element, cache)
  }
  if (cache.get(property) === value) return
  cache.set(property, value)
  element.style.setProperty(property, value)
}

export function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) setStyle(element, property, value)
}

export const writtenStyle = (element: HTMLElement, property: string): string | undefined => written.get(element)?.get(property)
