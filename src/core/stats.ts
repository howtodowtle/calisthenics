import { daysBetween } from './dates'
import type { Result } from './types'

export interface ExerciseStats {
  sessionsDone: number
  /** Lifetime sum of actuals (reps or seconds) across all plans. */
  totalActual: number
  /**
   * Session streak: consecutive completed sessions, each no more than 7 days
   * after the previous, still alive only if the last one is ≤7 days ago.
   */
  streak: number
}

/** Sum of actuals across a set list. */
export const sumActual = (sets: { actual: number }[]): number =>
  sets.reduce((sum, s) => sum + s.actual, 0)

/** Sum of targets across a set list. */
export const sumTarget = (sets: { target: number }[]): number =>
  sets.reduce((sum, s) => sum + s.target, 0)

/** A (possibly fractional) predicted max as shown to the user: floored, never
 * rounded up — being able to do 11.9 reps is still only 11. The epsilon
 * absorbs float noise so exact curve values stay exact. */
export const flooredMax = (value: number): number => Math.max(1, Math.floor(value + 1e-9))

/** `results` must already be filtered to one exercise (any of its plans). */
export function exerciseStats(results: Result[], today: string): ExerciseStats {
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date))
  const totalActual = sorted.reduce((sum, r) => sum + sumActual(r.sets), 0)
  let streak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const nextDate = i === sorted.length - 1 ? today : sorted[i + 1].date
    if (daysBetween(sorted[i].date, nextDate) <= 7) streak++
    else break
  }
  return { sessionsDone: sorted.length, totalActual, streak }
}
