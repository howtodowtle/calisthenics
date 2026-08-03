import { signal } from '@preact/signals'
import { todayISO } from './dates'
import { effectiveSession, fitProgress, isResultEditable, isStalePartial, partialToClose } from './derive'
import type {
  AppData,
  Exercise,
  Plan,
  ResultSet,
  SessionType,
  SetTemplate,
  Unit,
} from './types'

// The pure `AppData` selectors live in `select.ts` so core modules can use them
// without importing this one (which boots localStorage at import time). Callers
// that already reach for the store keep working.
export {
  activePlanFor,
  dueExerciseCount,
  hasActivePlan,
  resultsForExercise,
  sortedExercises,
} from './select'

/**
 * Single source of truth: one signal over the whole AppData blob, persisted to
 * localStorage on every commit. Data is a few KB — no finer granularity needed.
 */

const STORAGE_KEY = 'training-pwa'

const uid = (): string => crypto.randomUUID()
const nowISO = (): string => new Date().toISOString()

function seed(): AppData {
  const now = nowISO()
  return {
    version: 1,
    exercises: [
      { id: uid(), name: 'Push-ups', emoji: '💪', unit: 'reps', sortOrder: 0, createdAt: now },
      { id: uid(), name: 'Pull-ups', emoji: '🧗', unit: 'reps', sortOrder: 1, createdAt: now },
    ],
    plans: [],
    results: [],
  }
}

function isAppData(value: unknown): value is AppData {
  const d = value as AppData
  return (
    !!d &&
    d.version === 1 &&
    Array.isArray(d.exercises) &&
    Array.isArray(d.plans) &&
    Array.isArray(d.results)
  )
}

/**
 * One-shot data fixups (idempotent, run on every load/import):
 * - Active logistic-v1 plans move to logistic-v2 — the owner wants running
 *   plans on the improved math. Archived plans keep v1 so their history
 *   derives exactly as it was generated.
 * - Archived plans drop leftover per-set progress (`archive` clears it now;
 *   this catches data from before it did).
 * - Progress written before `startedOn` existed claims today, so it
 *   auto-closes once the day passes.
 */
function migrate(d: AppData): AppData {
  for (const p of d.plans) {
    if (p.status === 'active' && p.generatorId === 'logistic-v1') p.generatorId = 'logistic-v2'
    if (p.status !== 'active') delete p.progress
    else if (p.progress) p.progress.startedOn ??= todayISO()
  }
  return d
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isAppData(parsed)) return migrate(parsed)
      console.error('Stored data has unexpected shape; starting fresh')
    }
  } catch (err) {
    console.error('Failed to load stored data; starting fresh', err)
  }
  return seed()
}

export const db = signal<AppData>(load())

function update(mutate: (draft: AppData) => void): void {
  const next = structuredClone(db.value)
  mutate(next)
  db.value = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

// ---- exercises ----

export function addExercise(name: string, emoji: string, unit: Unit): void {
  update((d) => {
    d.exercises.push({
      id: uid(),
      name,
      emoji,
      unit,
      sortOrder: Math.max(-1, ...d.exercises.map((e) => e.sortOrder)) + 1,
      createdAt: nowISO(),
    })
  })
}

export function updateExercise(id: string, patch: Partial<Pick<Exercise, 'name' | 'emoji' | 'unit'>>): void {
  update((d) => {
    const e = d.exercises.find((x) => x.id === id)
    if (e) Object.assign(e, patch)
  })
}

/** Erases the exercise, all its plans and all their results. */
export function deleteExercise(id: string): void {
  update((d) => {
    const planIds = new Set(d.plans.filter((p) => p.exerciseId === id).map((p) => p.id))
    d.exercises = d.exercises.filter((e) => e.id !== id)
    d.plans = d.plans.filter((p) => p.exerciseId !== id)
    d.results = d.results.filter((r) => !planIds.has(r.planId))
  })
}

// ---- plans ----

function archive(p: Plan): void {
  p.status = 'archived'
  p.stoppedAt = nowISO()
  // In-day check-offs die with the plan — nothing can ever commit them.
  delete p.progress
}

export function createPlan(
  exerciseId: string,
  generatorId: string,
  params: Record<string, number>,
  startDate: string,
): void {
  update((d) => {
    // Invariant: one active plan per exercise.
    for (const p of d.plans) {
      if (p.exerciseId === exerciseId && p.status === 'active') archive(p)
    }
    d.plans.push({
      id: uid(),
      exerciseId,
      generatorId,
      params,
      status: 'active',
      startDate,
      createdAt: nowISO(),
      calibrations: [],
      overrides: {},
    })
  })
}

/** Future sessions re-derive from the new params; past results are untouched. */
export function updatePlanParams(planId: string, params: Record<string, number>): void {
  update((d) => {
    const p = d.plans.find((x) => x.id === planId)
    if (p) p.params = params
  })
}

export function stopPlan(planId: string): void {
  update((d) => {
    const p = d.plans.find((x) => x.id === planId)
    if (p) archive(p)
  })
}

/** Erases the plan and its results. Archived history dies with it — confirm in UI. */
export function deletePlan(planId: string): void {
  update((d) => {
    d.plans = d.plans.filter((p) => p.id !== planId)
    d.results = d.results.filter((r) => r.planId !== planId)
  })
}

// ---- overrides ----

export function setOverride(planId: string, sessionIndex: number, sets: SetTemplate[]): void {
  update((d) => {
    const p = d.plans.find((x) => x.id === planId)
    if (p) p.overrides[sessionIndex] = { sets }
  })
}

export function clearOverride(planId: string, sessionIndex: number): void {
  update((d) => {
    const p = d.plans.find((x) => x.id === planId)
    if (p) delete p.overrides[sessionIndex]
  })
}

// ---- logging ----

const toResultSets = (sets: SetTemplate[], actuals: number[]): ResultSet[] =>
  sets.map((s, i) => ({ target: s.target, isMinimum: s.isMinimum, actual: actuals[i] }))

/** Stored per-set progress of a session, fitted to the given set count. */
const progressOf = (p: Plan, sessionIndex: number, count: number): (number | null)[] =>
  fitProgress(p.progress?.sessionIndex === sessionIndex ? p.progress.actuals : [], count)

/** A max test's calibration point is its single set's actual. One owner for
 * this rule so committing and editing a test can never disagree. */
const testCalibrationActual = (sets: ResultSet[]): number => sets[0]?.actual ?? 0

/** Writes the immutable Result, folds test results into calibrations, and
 * clears any per-set progress the session accumulated during the day.
 * A null actual means the set was never attempted (an auto-closed partial):
 * it is recorded as 0, and a test whose measuring set was never attempted
 * writes no calibration point — a non-attempt must not bend the curve. */
function commitResult(
  d: AppData,
  p: Plan,
  sessionIndex: number,
  sessionType: SessionType,
  sets: SetTemplate[],
  actuals: (number | null)[],
  date: string,
): void {
  const resultSets = toResultSets(sets, actuals.map((a) => a ?? 0))
  d.results.push({ id: uid(), planId: p.id, sessionIndex, date, sessionType, sets: resultSets, completedAt: nowISO() })
  // A test's single-set actual becomes the calibration point that bends
  // the rest of the curve.
  if (sessionType === 'test' && actuals[0] != null) {
    p.calibrations.push({ sessionIndex, actual: testCalibrationActual(resultSets) })
  }
  if (p.progress?.sessionIndex === sessionIndex) delete p.progress
}

/** Logs the whole session in one go. `actuals` (aligned with the session's
 * sets) wins when given; otherwise each set falls back to its checked-off
 * progress, then to the planned target. */
export function completeSession(
  planId: string,
  sessionIndex: number,
  actuals?: number[],
  date: string = todayISO(),
): void {
  update((d) => {
    const p = d.plans.find((x) => x.id === planId)
    const session = p && effectiveSession(p, sessionIndex)
    if (!p || !session) return
    const progress = progressOf(p, sessionIndex, session.sets.length)
    const filled = session.sets.map((s, i) => actuals?.[i] ?? progress[i] ?? s.target)
    commitResult(d, p, sessionIndex, session.type, session.sets, filled, date)
  })
}

/** Checks off a single set of the due session — sets can land one at a time
 * through the day. `actual` defaults to the set's planned target. When the
 * last set lands, the session finalizes into a Result exactly as a one-go
 * log would. */
export function logSet(
  planId: string,
  sessionIndex: number,
  setIndex: number,
  actual?: number,
  date: string = todayISO(),
): void {
  update((d) => {
    const p = d.plans.find((x) => x.id === planId)
    const session = p && effectiveSession(p, sessionIndex)
    if (!p || !session || !session.sets[setIndex]) return
    const actuals = progressOf(p, sessionIndex, session.sets.length)
    actuals[setIndex] = actual ?? session.sets[setIndex].target
    if (actuals.every((a) => a != null)) {
      commitResult(d, p, sessionIndex, session.type, session.sets, actuals, date)
    } else {
      // Keep the day of the first check-off; a fresh session claims today.
      const startedOn =
        p.progress?.sessionIndex === sessionIndex ? (p.progress.startedOn ?? date) : date
      p.progress = { sessionIndex, actuals, startedOn }
    }
  })
}

/**
 * Commits `partialToClose`'s Result for every plan whose partial's day has
 * passed (see its doc for the semantics), and drops stale progress that can't
 * close — nothing done at all, or a session the generator no longer produces.
 * Idempotent; the store runs it whenever data enters (load, import) and the
 * UI on midnight rollover — there is no backend to do it at actual midnight.
 */
export function finalizeStalePartials(today: string = todayISO()): void {
  const stale = (p: Plan): boolean => isStalePartial(p.progress, today)
  if (!db.value.plans.some(stale)) return
  update((d) => {
    for (const p of d.plans) {
      if (!stale(p)) continue
      const close = partialToClose(p, today)
      if (close) {
        commitResult(d, p, close.sessionIndex, close.sessionType, close.sets, close.actuals, close.date)
      } else {
        delete p.progress
      }
    }
  })
}

/** Un-checks a set (mistap insurance). Clearing the last one drops the
 * progress record entirely. */
export function undoSet(planId: string, sessionIndex: number, setIndex: number): void {
  update((d) => {
    const p = d.plans.find((x) => x.id === planId)
    if (!p || p.progress?.sessionIndex !== sessionIndex) return
    p.progress.actuals[setIndex] = null
    if (p.progress.actuals.every((a) => a == null)) delete p.progress
  })
}

/** Corrects the actual counts of an already-logged session. The store guards
 * the 24h edit window itself (`isResultEditable`) — a frozen Result never
 * changes, whatever the caller. Only the actuals move; targets, date and set
 * count are facts of the day and stay put. A max test's calibration point
 * follows the corrected number so the curve stays honest. */
export function editResult(resultId: string, actuals: number[]): void {
  update((d) => {
    const r = d.results.find((x) => x.id === resultId)
    if (!r || !isResultEditable(r, Date.now(), todayISO())) return
    r.sets = r.sets.map((s, i) => ({ ...s, actual: actuals[i] ?? s.actual }))
    if (r.sessionType === 'test') {
      const cal = d.plans
        .find((x) => x.id === r.planId)
        ?.calibrations.find((c) => c.sessionIndex === r.sessionIndex)
      if (cal) cal.actual = testCalibrationActual(r.sets)
    }
  })
}

/** Erases a logged session for good — the escape hatch for a session that
 * should never have been logged. On an active plan the slot simply has no
 * Result anymore, so it comes back as due and reschedules. A deleted test
 * takes its calibration point with it: a result that no longer exists must
 * not keep bending the curve. Destructive — confirm in UI. */
export function deleteResult(resultId: string): void {
  update((d) => {
    const r = d.results.find((x) => x.id === resultId)
    if (!r) return
    d.results = d.results.filter((x) => x.id !== resultId)
    if (r.sessionType === 'test') {
      const p = d.plans.find((x) => x.id === r.planId)
      if (p) p.calibrations = p.calibrations.filter((c) => c.sessionIndex !== r.sessionIndex)
    }
  })
}

// ---- backup ----

export function exportJSON(): string {
  return JSON.stringify(db.value, null, 2)
}

export function importJSON(text: string): void {
  const parsed = JSON.parse(text)
  if (!isAppData(parsed)) throw new Error('Not a valid backup file')
  const migrated = migrate(parsed)
  db.value = migrated
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
  finalizeStalePartials()
}

// Loaded data may already contain a partial from a past day — close it now,
// before anything renders. (Midnight rollover while open is the UI's job.)
finalizeStalePartials()
