import { signal } from '@preact/signals'
import { todayISO } from './dates'
import { derivePlanView } from './derive'
import type {
  AppData,
  Exercise,
  Plan,
  Result,
  ResultSet,
  SessionType,
  SetTemplate,
  Unit,
} from './types'

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
 */
function migrate(d: AppData): AppData {
  for (const p of d.plans) {
    if (p.status === 'active' && p.generatorId === 'logistic-v1') p.generatorId = 'logistic-v2'
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

/** Exercises in display order. */
export const sortedExercises = (d: AppData): Exercise[] =>
  [...d.exercises].sort((a, b) => a.sortOrder - b.sortOrder)

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

/** The one active plan of an exercise, if any. */
export const activePlanFor = (d: AppData, exerciseId: string): Plan | undefined =>
  d.plans.find((p) => p.exerciseId === exerciseId && p.status === 'active')

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

function archive(p: Plan): void {
  p.status = 'archived'
  p.stoppedAt = nowISO()
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

export function logSession(
  planId: string,
  sessionIndex: number,
  sessionType: SessionType,
  sets: ResultSet[],
  date: string = todayISO(),
): void {
  update((d) => {
    d.results.push({ id: uid(), planId, sessionIndex, date, sessionType, sets })
    if (sessionType === 'test') {
      const p = d.plans.find((x) => x.id === planId)
      // A test's single-set actual becomes the calibration point that bends
      // the rest of the curve.
      if (p) p.calibrations.push({ sessionIndex, actual: sets[0]?.actual ?? 0 })
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
}
