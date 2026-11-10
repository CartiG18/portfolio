/**
 * Shared time of day for every scene. Night is the default and the original look; day is
 * golden hour. The choice is remembered per visitor (localStorage, best effort) and mirrored on
 * <html data-time="night|day"> so HTML overlays can adapt.
 */
export type TimeOfDay = 'night' | 'day'

const KEY = 'museum-time-of-day'
const listeners = new Set<(t: TimeOfDay) => void>()

function load(): TimeOfDay {
  try {
    return localStorage.getItem(KEY) === 'day' ? 'day' : 'night'
  } catch {
    return 'night'
  }
}

let current: TimeOfDay = load()
document.documentElement.dataset.time = current

export function getTimeOfDay(): TimeOfDay {
  return current
}

export function setTimeOfDay(t: TimeOfDay): void {
  if (t === current) return
  current = t
  document.documentElement.dataset.time = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // Private mode or blocked storage: the choice just won't persist.
  }
  for (const fn of listeners) fn(t)
}

export function toggleTimeOfDay(): TimeOfDay {
  setTimeOfDay(current === 'day' ? 'night' : 'day')
  return current
}

export function subscribeTimeOfDay(fn: (t: TimeOfDay) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/**
 * A 0 (night) → 1 (day) value that eases over ~1.5s whenever the time of day changes.
 * Starts at the current state without animating; reduced motion swaps instantly.
 */
export function createDayBlend(reducedMotion: boolean, duration = 1.5) {
  let value = current === 'day' ? 1 : 0
  let from = value
  let to = value
  let start = -1
  const unsubscribe = subscribeTimeOfDay((t) => {
    from = value
    to = t === 'day' ? 1 : 0
    start = -1 // stamped on the next tick
  })
  return {
    /** Advance with the scene clock (seconds) and return the blend. */
    update(time: number): number {
      if (value === to) return value
      if (reducedMotion) return (value = to)
      if (start < 0) start = time
      const k = Math.min(1, (time - start) / duration)
      value = from + (to - from) * easeInOut(k)
      return value
    },
    get value() {
      return value
    },
    dispose: unsubscribe,
  }
}
