import { daysBetween } from './dates'
import { perWeekOf } from './schedule'
import type { Plan, Result } from './types'

export interface ExerciseStats {
  sessionsDone: number
  /** Lifetime sum of actuals (reps or seconds) across all plans. */
  totalActual: number
  /**
   * Session streak: consecutive completed sessions, each within the streak
   * window of the previous, still alive only if the last one is within its
   * window of today. See `streakWindow` for the window; each gap is judged
   * by the plan of the session that opened it.
   */
  streak: number
}

/**
 * Days a streak survives after a session before it breaks: twice the plan's
 * average session spacing (2 × 7/sessionsPerWeek), capped at 7. At 3/week
 * that's ~4.67 days; at 2/week or less the cap keeps it at 7.
 */
export const streakWindow = (plan: Plan | undefined): number =>
  plan ? Math.min(7, 2 * (7 / perWeekOf(plan.params))) : 7

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

/** `results` must already be filtered to one exercise (any of its plans);
 * `plans` is any list containing the plans those results belong to. */
export function exerciseStats(results: Result[], plans: Plan[], today: string): ExerciseStats {
  const windows = new Map(plans.map((p) => [p.id, streakWindow(p)]))
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date))
  const totalActual = sorted.reduce((sum, r) => sum + sumActual(r.sets), 0)
  let streak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const nextDate = i === sorted.length - 1 ? today : sorted[i + 1].date
    if (daysBetween(sorted[i].date, nextDate) <= (windows.get(sorted[i].planId) ?? 7)) streak++
    else break
  }
  return { sessionsDone: sorted.length, totalActual, streak }
}
