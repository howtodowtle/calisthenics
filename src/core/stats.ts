import { daysBetween } from './dates'
import { avgGapOf } from './schedule'
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
  /** Average completed sessions per week since the first session. */
  sessionsPerWeek: number
  /** Average actuals per week since the first session. */
  actualPerWeek: number
  /** Lifetime average actuals per completed session. */
  avgPerSession: number
  /** Highest actuals total in a single session. */
  bestSession: number
  /** Distinct calendar weeks (from the first session) containing at least one session. */
  weeksTrained: number
}

/**
 * Days a streak survives after a session before it breaks: twice the plan's
 * average session gap, capped at 7. No plan known → the cap.
 */
export const streakWindow = (plan: Plan | undefined): number =>
  plan ? Math.min(7, 2 * avgGapOf(plan.params)) : 7

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

/** `results` must already be filtered to one exercise, `plans` to that
 * exercise's plans (see `plansForExercise`). */
export function exerciseStats(results: Result[], plans: Plan[], today: string): ExerciseStats {
  const planById = new Map(plans.map((p) => [p.id, p]))
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date))
  const actuals = sorted.map((r) => sumActual(r.sets))
  const totalActual = actuals.reduce((sum, a) => sum + a, 0)

  let streak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const nextDate = i === sorted.length - 1 ? today : sorted[i + 1].date
    if (daysBetween(sorted[i].date, nextDate) <= streakWindow(planById.get(sorted[i].planId))) streak++
    else break
  }

  const sessionsDone = sorted.length
  let sessionsPerWeek = 0
  let actualPerWeek = 0
  let weeksTrained = 0
  if (sessionsDone > 0) {
    const firstDate = sorted[0].date
    const weeksSpan = Math.max(1, daysBetween(firstDate, today) / 7)
    sessionsPerWeek = sessionsDone / weeksSpan
    actualPerWeek = totalActual / weeksSpan
    weeksTrained = new Set(sorted.map((r) => Math.floor(daysBetween(firstDate, r.date) / 7))).size
  }

  return {
    sessionsDone,
    totalActual,
    streak,
    sessionsPerWeek,
    actualPerWeek,
    avgPerSession: sessionsDone > 0 ? totalActual / sessionsDone : 0,
    bestSession: actuals.length > 0 ? Math.max(...actuals) : 0,
    weeksTrained,
  }
}
