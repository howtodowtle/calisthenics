import { getGenerator } from './generators'
import { baseDates, perWeekOf, shiftedDates, weekOf } from './schedule'
import type { CalibrationPoint, Plan, Result, SessionType, SetTemplate } from './types'

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
  /** Result completion date for done sessions, shifted schedule date otherwise. */
  date: string
  week: number
  result?: Result
  status: 'done' | 'due' | 'upcoming'
  /** From the generator, when its algorithm models one. */
  predictedMax?: number
}

export interface PlanView {
  plan: Plan
  sessions: SessionView[]
  /** Session for the Today card: first incomplete one whose date ≤ today. */
  due: SessionView | null
  /** Next upcoming session when nothing is due. */
  next: SessionView | null
  endDate: string
  completedCount: number
  /** A session of this exercise was logged today — any plan, so finishing an
   * old plan's session still counts as having trained. */
  completedToday: boolean
}

export function derivePlanView(plan: Plan, results: Result[], today: string): PlanView {
  const perWeek = perWeekOf(plan.params)
  const templates = getGenerator(plan.generatorId).generate(plan.params, plan.calibrations)

  const resultByIndex = new Map<number, Result>()
  for (const r of results) {
    if (r.planId === plan.id) resultByIndex.set(r.sessionIndex, r)
  }

  let firstIncomplete = templates.findIndex((t) => !resultByIndex.has(t.index))
  if (firstIncomplete === -1) firstIncomplete = templates.length
  const dates = shiftedDates(
    baseDates(plan.startDate, templates.length, perWeek),
    firstIncomplete,
    today,
  )

  const sessions: SessionView[] = templates.map((t, i) => {
    const result = resultByIndex.get(t.index)
    const override = plan.overrides[t.index]
    // Only the first incomplete session can be due — logging is sequential.
    const status: SessionView['status'] = result
      ? 'done'
      : i === firstIncomplete && dates[i] <= today
        ? 'due'
        : 'upcoming'
    return {
      index: t.index,
      type: t.type,
      sets: override ? override.sets : t.sets,
      overridden: Boolean(override),
      date: result ? result.date : dates[i],
      week: weekOf(i, perWeek) + 1,
      result,
      status,
      predictedMax: t.predictedMax,
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
    completedToday: results.some((r) => r.date === today),
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

/**
 * predictedMax per "planId:sessionIndex" key — lets history rows (which span
 * plans) look up the max a session was planned around.
 */
export function predictedMaxIndex(view: PlanView): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of view.sessions) {
    if (s.predictedMax != null) map.set(`${view.plan.id}:${s.index}`, s.predictedMax)
  }
  return map
}
