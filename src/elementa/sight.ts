
import type { UIComponent } from './component'

export type Sighted = (entry: IntersectionObserverEntry) => void

const MARGIN = '64px 0px'

const watchers = new WeakMap<Element, Set<Sighted>>()
const lastWord = new WeakMap<Element, IntersectionObserverEntry>()
let observer: IntersectionObserver | null | undefined

const observing = (): IntersectionObserver | null => {
  if (observer !== undefined) return observer
  observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              lastWord.set(entry.target, entry)
              const held = watchers.get(entry.target)
              if (!held) continue
              for (const seen of [...held]) seen(entry)
            }
          },
          { rootMargin: MARGIN },
        )
  return observer
}

export function recall(element: Element): void {
  const known = lastWord.get(element)
  const held = watchers.get(element)
  if (!known || !held) return
  for (const seen of [...held]) seen(known)
}

export const sighted = (): boolean => observing() !== null

export function sight(element: Element, seen: Sighted): () => void {
  const held = watchers.get(element)
  if (held) {
    held.add(seen)
    const known = lastWord.get(element)
    if (known) seen(known)
  } else {
    watchers.set(element, new Set([seen]))
    observing()?.observe(element)
  }
  return () => {
    const set = watchers.get(element)
    if (!set) return
    set.delete(seen)
    if (set.size === 0) {
      watchers.delete(element)
      observer?.unobserve(element)
    }
  }
}

export function cardOf(component: UIComponent): HTMLElement | null {
  for (let node: UIComponent | null = component; node; node = node.parent) {
    if (node.sealed && node.element) return node.element
  }
  return component.element
}
