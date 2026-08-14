export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
