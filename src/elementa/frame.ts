let owed = true
let awakeUntil = 0

export const invalidateLayout = (): void => {
  owed = true
}

export function wake(seconds: number): void {
  awakeUntil = Math.max(awakeUntil, performance.now() + seconds * 1000)
}

export function layoutOwed(now: number): boolean {
  if (!owed && now >= awakeUntil) return false
  owed = false
  return true
}
