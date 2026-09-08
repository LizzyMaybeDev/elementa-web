export class Kept<T> {
  private readonly held = new Map<string, T>()
  private readonly used = new Set<string>()

  begin(): void {
    this.used.clear()
  }

  take(key: string, make: () => T): T {
    let held = this.held.get(key)
    if (held === undefined) {
      held = make()
      this.held.set(key, held)
    }
    this.used.add(key)
    return held
  }

  forget(): T[] {
    const gone: T[] = []
    for (const [key, held] of this.held) {
      if (this.used.has(key)) continue
      this.held.delete(key)
      gone.push(held)
    }
    return gone
  }

  clear(): T[] {
    const gone = [...this.held.values()]
    this.held.clear()
    this.used.clear()
    return gone
  }
}
