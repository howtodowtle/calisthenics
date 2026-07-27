import { addDays } from './dates'
import { derivePlanView, type SessionView } from './derive'
import { activePlanFor, resultsForExercise, sortedExercises } from './store'
import type { AppData, Exercise } from './types'

/**
 * The cross-exercise week view: what's due today and what's coming up, grouped
 * per calendar day.
 *
 * This is the one place that looks at *all* exercises at once. `derive.ts`
 * answers "what does this plan look like right now"; this answers "what does my
 * week look like", and it does so by regrouping `derivePlanView` output — it
 * owns no scheduling rules of its own. If a session's date is wrong here, it is
 * wrong in `schedule.ts`.
 *
 * Honesty note: only *today* is a fact. Later days are a projection that
 * assumes you keep up — `shiftedDates` slides the remaining schedule forward
 * from the first incomplete session, so skipping today moves everything after
 * it by a day. The UI says so; don't present these dates as appointments.
 */

/** One exercise's session landing on a given day. */
export interface OverviewEntry {
  exercise: Exercise
  /** The plan the session belongs to — the exercise's active one. */
  planId: string
  session: SessionView
}

/** One calendar day of the window. `entries` is empty on rest days. */
export interface OverviewDay {
  date: string // yyyy-mm-dd
  /** Sessions on this day, in exercise display order. At most one per exercise
   * (a plan never schedules two sessions on the same date). */
  entries: OverviewEntry[]
}

/** Days shown by the overview: today plus the next six. */
export const OVERVIEW_DAYS = 7

/**
 * Every day from `today` to `today + days - 1`, each with the incomplete
 * sessions scheduled on it across all exercises with an active plan.
 *
 * The full window is always returned, rest days included as empty entries —
 * whether to render or hide those is a presentation choice, kept in the UI.
 *
 * Completed sessions are left out: this is a forward-looking view. An overdue
 * session (the plan's `due` one, if its date somehow slipped behind) is filed
 * under today — it's what you owe now, not a past appointment.
 */
export function deriveOverview(
  d: AppData,
  today: string,
  days: number = OVERVIEW_DAYS,
): OverviewDay[] {
  const lastDate = addDays(today, days - 1)
  const byDate = new Map<string, OverviewEntry[]>()

  for (const exercise of sortedExercises(d)) {
    const plan = activePlanFor(d, exercise.id)
    if (!plan) continue
    const view = derivePlanView(plan, resultsForExercise(d, exercise.id), today)

    for (const session of view.sessions) {
      if (session.status === 'done') continue
      const date = session.date < today ? today : session.date
      // Incomplete sessions are date-ordered (a plan's dates only ever
      // increase), so the first one past the window ends this plan's scan.
      if (date > lastDate) break
      const entry: OverviewEntry = { exercise, planId: plan.id, session }
      const existing = byDate.get(date)
      if (existing) existing.push(entry)
      else byDate.set(date, [entry])
    }
  }

  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i)
    return { date, entries: byDate.get(date) ?? [] }
  })
}

/** Total sessions in the window — the "3 sessions in the next 7 days" line. */
export const countSessions = (days: OverviewDay[]): number =>
  days.reduce((n, day) => n + day.entries.length, 0)

/** How far into a session's sets you already are, for a day that's underway.
 * `null` when nothing is checked off, so callers can skip the annotation. */
export function progressNote(session: SessionView): { done: number; total: number } | null {
  const done = session.progress?.filter((a) => a != null).length ?? 0
  return done > 0 ? { done, total: session.sets.length } : null
}
