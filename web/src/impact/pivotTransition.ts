export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

/** Daha yumuşak çıkış — geri kaydırma için */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type Viewport = { x: number; y: number; zoom: number }

type ViewportApi = {
  getViewport: () => Viewport
  setViewport: (vp: Viewport, opts?: { duration?: number }) => void
}

/** Akıcı viewport kaydırma (React Flow duration yerine easing) */
export function animateViewport(
  rf: ViewportApi,
  to: Viewport,
  ms: number,
  ease: (t: number) => number = easeInOutCubic,
  from?: Viewport,
): Promise<void> {
  const start = from ?? rf.getViewport()
  if (ms <= 0) {
    rf.setViewport(to, { duration: 0 })
    return Promise.resolve()
  }
  const t0 = performance.now()
  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      const e = ease(t)
      rf.setViewport(
        {
          x: lerp(start.x, to.x, e),
          y: lerp(start.y, to.y, e),
          zoom: lerp(start.zoom, to.zoom, e),
        },
        { duration: 0 },
      )
      if (t < 1) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
}
