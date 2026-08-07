import { addDays } from './dates'
import { getGenerator } from './generators'
import { baseDates, perWeekOf, shiftedDates, weekOf } from './schedule'
import type { CalibrationPoint, Plan, Result, SessionProgress, SessionType, SetTemplate } from './types'

/**
 * Combines generator output + overrides + results + today into what the UI
 * renders. Recomputed on every state change; ~40 sessions, cost is nil.
 */

export interface SessionView {
  index: number
  type: SessionType
  /** Effective sets: override if present, generated otherwise. */
  sets: SetTemplate[]
  overridden: boolean
  /** Day the session happens: Result date once done, the day its sets started
   * (progress.startedOn) while in progress, shifted schedule date otherwise.
   * Differs from `scheduledDate` only for a session pulled forward. */
  date: string
  /** Day the plan puts the session on (the shifted schedule date). */
  scheduledDate: string
  week: number
  result?: Result
  /** 'skipped': its Result was deleted — settled, not owed (see Plan.skipped). */
  status: 'done' | 'due' | 'upcoming' | 'skipped'
  /** From the generator, when its algorithm models one. */
  predictedMax?: number
  /** Per-set actuals checked off so far — only on the in-progress session. */
  progress?: (number | null)[]
}

/** Progress actuals resized to the session's current set count — an override
 * that adds or removes sets mid-day must not orphan or misalign check-offs. */
export function fitProgress(
  actuals: readonly (number | null)[],
  count: number,
): (number | null)[] {
  return Array.from({ length: count }, (_, i) => actuals[i] ?? null)
}

/** How many sets have been checked off — the one definition of "how far into
 * this session am I", shared by the Today card and the overview. */
export const countDone = (actuals: readonly (number | null)[] | undefined): number =>
  actuals?.filter((a) => a != null).length ?? 0

/** Sessions still owed — the one definition of what the schedule list and
 * the week overview show. A whitelist, so any future status stays hidden
 * until it opts in. */
export const isPending = (s: SessionView): boolean =>
  s.status === 'due' || s.status === 'upcoming'

/** Effective (type, sets) of a single session — generator output ⊕ override.
 * Point lookup for store mutations, so logging derives the session from the
 * plan's own inputs instead of trusting a UI render-time snapshot. */
export function effectiveSession(
  plan: Plan,
  sessionIndex: number,
): { type: SessionType; sets: SetTemplate[] } | null {
  const t = getGenerator(plan.generatorId)
    .generate(plan.params, plan.calibrations)
    .find((x) => x.index === sessionIndex)
  if (!t) return null
  return { type: t.type, sets: plan.overrides[sessionIndex]?.sets ?? t.sets }
}

/** Check-offs whose calendar day has ended — the one definition of "stale". */
export const isStalePartial = (progress: SessionProgress | undefined, today: string): boolean =>
  progress?.startedOn != null && progress.startedOn < today

/**
 * What a stale partial should close into: the session's effective sets and
 * the fitted per-set actuals (null = never attempted), dated to the day the
 * reps happened. A partial is a session that *was* trained — just with fewer
 * reps — so it commits as done and the plan advances; `commitResult` records
 * the nulls as 0 and skips a test's calibration when its measuring set is
 * null. Returns null when there is nothing to close: not a stale partial, no
 * set done at all (an untouched session rolls forward instead), or a session
 * index the generator no longer produces.
 */
export function partialToClose(
  plan: Plan,
  today: string,
): {
  sessionIndex: number
  sessionType: SessionType
  sets: SetTemplate[]
  actuals: (number | null)[]
  date: string
} | null {
  const progress = plan.progress
  if (!progress?.startedOn || !isStalePartial(progress, today)) return null
  const session = effectiveSession(plan, progress.sessionIndex)
  if (!session) return null
  const actuals = fitProgress(progress.actuals, session.sets.length)
  if (!actuals.some((a) => a != null)) return null
  return {
    sessionIndex: progress.sessionIndex,
    sessionType: session.type,
    sets: session.sets,
    actuals,
    date: progress.startedOn,
  }
}

export interface PlanView {
  plan: Plan
  sessions: SessionView[]
  /** Session for the Today card: first incomplete one whose date ≤ today.
   * A pulled-forward session counts — its date is the day it started. */
  due: SessionView | null
  /** Next upcoming session when nothing is due. */
  next: SessionView | null
  endDate: string
  /** Results only — a skipped slot counts to neither side, so a plan with
   * skips never reads N/N. */
  completedCount: number
  /** A session of this exercise was logged today — any plan, so finishing an
   * old plan's session still counts as having trained. Also the input to the
   * one-session-per-day floor: when set, the remaining schedule starts
   * tomorrow, so its cross-plan scope is intentional. */
  completedToday: boolean
}

export function derivePlanView(plan: Plan, results: Result[], today: string): PlanView {
  const perWeek = perWeekOf(plan.params)
  const templates = getGenerator(plan.generatorId).generate(plan.params, plan.calibrations)

  const resultByIndex = new Map<number, Result>()
  for (const r of results) {
    if (r.planId === plan.id) resultByIndex.set(r.sessionIndex, r)
  }

  const skipped = plan.skipped ?? []
  let firstIncomplete = templates.findIndex(
    (t) => !resultByIndex.has(t.index) && !skipped.includes(t.index),
  )
  if (firstIncomplete === -1) firstIncomplete = templates.length
  const completedToday = results.some((r) => r.date === today)
  // A behind-schedule plan's next base date is also in the past, so without
  // this floor the next session would fall due the moment today's completes —
  // one session per day unless the user explicitly pulls the next one forward
  // (`startSessionEarly` in store.ts, which dates it today via `started`).
  const earliest = completedToday ? addDays(today, 1) : today
  const dates = shiftedDates(
    baseDates(plan.startDate, templates.length, perWeek),
    firstIncomplete,
    earliest,
  )

  // A session in progress happens on the day it started, however its scheduled
  // date lies — that is the whole pull-forward mechanism: "Do it today" stores
  // an empty started-today progress, and everything downstream (due status,
  // overview filing, list dates) follows from the date. Scoped to the first
  // incomplete session, the only one that can legitimately be in progress.
  // The explicit progress check matters: on a completed plan both sides of the
  // index comparison are undefined, which must not read as a match. The clamp
  // guards against clocks that moved backward (midnight race, timezone travel):
  // a session started "in the future" is simply being done today — unclamped it
  // would be neither due nor sweepable until the calendar caught up.
  const startedOn =
    plan.progress && plan.progress.sessionIndex === templates[firstIncomplete]?.index
      ? plan.progress.startedOn
      : undefined
  const started = startedOn && startedOn > today ? today : startedOn

  /** The session state machine — first match wins. */
  const statusOf = (index: number, i: number, result?: Result): SessionView['status'] => {
    if (result) return 'done'
    if (skipped.includes(index)) return 'skipped' // settled, not owed
    // Only the first incomplete session can be due — logging is sequential.
    if (i === firstIncomplete && (started ?? dates[i]) <= today) return 'due'
    return 'upcoming'
  }

  const sessions: SessionView[] = templates.map((t, i) => {
    const result = resultByIndex.get(t.index)
    const override = plan.overrides[t.index]
    const status = statusOf(t.index, i, result)
    const sets = override ? override.sets : t.sets
    return {
      index: t.index,
      type: t.type,
      sets,
      overridden: Boolean(override),
      date: result ? result.date : i === firstIncomplete && started ? started : dates[i],
      scheduledDate: dates[i],
      week: weekOf(i, perWeek) + 1,
      result,
      status,
      predictedMax: t.predictedMax,
      progress:
        !result && plan.progress?.sessionIndex === t.index
          ? fitProgress(plan.progress.actuals, sets.length)
          : undefined,
    }
  })

  const due = sessions.find((s) => s.status === 'due') ?? null
  const next = due ? null : (sessions.find((s) => s.status === 'upcoming') ?? null)

  return {
    plan,
    sessions,
    due,
    next,
    endDate: dates[dates.length - 1],
    completedCount: resultByIndex.size,
    completedToday,
  }
}

/**
 * Session count + end date a (generator, params, start date) combo would
 * produce — the plan-form preview, derived the same way a real plan is.
 */
export function previewPlan(
  generatorId: string,
  params: Record<string, number>,
  startDate: string,
  calibrations: CalibrationPoint[],
): { count: number; end: string } {
  const sessions = getGenerator(generatorId).generate(params, calibrations)
  const dates = baseDates(startDate, sessions.length, perWeekOf(params))
  return { count: sessions.length, end: dates[dates.length - 1] }
}

/** How long after finishing a logged session its numbers stay editable. */
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Whether a completed session can still have its numbers corrected. New results
 * carry a `completedAt` timestamp and stay editable for 24h after finishing.
 * Legacy results (logged before the timestamp existed) fall back to "only while
 * it's still that calendar day".
 */
export function isResultEditable(r: Result, nowMs: number, today: string): boolean {
  if (r.completedAt) return nowMs - Date.parse(r.completedAt) < EDIT_WINDOW_MS
  return r.date === today
}

/** Identity of a session within a plan — the one owner of the
 * "planId:sessionIndex" format used for lookups and UI list keys. */
export const sessionKey = (planId: string, sessionIndex: number): string =>
  `${planId}:${sessionIndex}`

/**
 * predictedMax per `sessionKey` — lets history rows (which span plans) look
 * up the max a session was planned around.
 */
export function predictedMaxIndex(view: PlanView): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of view.sessions) {
    if (s.predictedMax != null) map.set(sessionKey(view.plan.id, s.index), s.predictedMax)
  }
  return map
}
