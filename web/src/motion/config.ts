import { useReducedMotion, type Transition } from 'motion/react'

export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.85,
}

export const springSoft: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 28,
  mass: 0.9,
}

export const layoutSpring: Transition = {
  type: 'spring',
  stiffness: 340,
  damping: 32,
  mass: 0.88,
}

export const accordionSpring: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
  mass: 0.9,
}

/** Animate UI AutoHeight — içerik yüksekliği spring */
export const autoHeightSpring: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 0.88,
  bounce: 0,
}

export const popoverSpring: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.82,
}

export const tooltipSpring: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.75,
}

export const modalSpring: Transition = {
  type: 'spring',
  stiffness: 360,
  damping: 32,
  mass: 0.92,
}

export const listItemTransition = (index: number): Transition => ({
  type: 'spring',
  stiffness: 360,
  damping: 30,
  delay: Math.min(index * 0.04, 0.24),
})

export function useMotionEnabled() {
  return !useReducedMotion()
}
