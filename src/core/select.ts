import { derivePlanView } from './derive'
import type { AppData, Exercise, Plan, Result } from './types'

/**
 * Pure selectors over an `AppData` blob — the questions the rest of the app
 * asks of stored data, each with exactly one owner.
 *
 * These live apart from `store.ts` on purpose: `store.ts` is the persistence
 * singleton (it reads localStorage and creates the signal at import time), and
 * nothing in `core/` should have to boot that just to ask "which plan is
 * active?". `store.ts` re-exports everything here, so callers can keep
 * importing either module.
 */

/** Exercises in display order. */
export const sortedExercises = (d: AppData): Exercise[] =>
  [...d.exercises].sort((a, b) => a.sortOrder - b.sortOrder)

/** The one active plan of an exercise, if any. */
export const activePlanFor = (d: AppData, exerciseId: string): Plan | undefined =>
  d.plans.find((p) => p.exerciseId === exerciseId && p.status === 'active')

/** Whether anything is being trained at all — distinguishes "no plans yet"
 * from "plans, but nothing scheduled right now". */
export const hasActivePlan = (d: AppData): boolean =>
  d.plans.some((p) => p.status === 'active')

/** Results across all plans (active and archived) of an exercise. */
export function resultsForExercise(d: AppData, exerciseId: string): Result[] {
  const planIds = new Set(d.plans.filter((p) => p.exerciseId === exerciseId).map((p) => p.id))
  return d.results.filter((r) => planIds.has(r.planId))
}

/** How many exercises have a session due — drives the tab notification badge. */
export function dueExerciseCount(d: AppData, today: string): number {
  return d.exercises.filter((e) => {
    const plan = activePlanFor(d, e.id)
    return plan && derivePlanView(plan, resultsForExercise(d, e.id), today).due !== null
  }).length
}
