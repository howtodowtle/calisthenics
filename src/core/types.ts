/**
 * Core data model.
 *
 * Architecture rule: past = facts, future = pure function.
 * - Completing a session writes an immutable `Result` snapshot.
 * - The displayed schedule for incomplete sessions is always derived on the fly
 *   from (plan.params, plan.calibrations, plan.overrides, results, today).
 * Storage only ever holds inputs, never generated sessions.
 */

export type Unit = 'reps' | 'seconds'

export type SessionType = 'normal' | 'test' | 'taper' | 'recovery'

export interface Exercise {
  id: string
  name: string
  emoji: string
  unit: Unit
  sortOrder: number
  createdAt: string // ISO date-time
}

/** Outcome of a max-test session; bends the future curve toward reality. */
export interface CalibrationPoint {
  sessionIndex: number // 1-based session the test happened at
  actual: number
}

export interface SetTemplate {
  target: number
  /** "At least this many, then all you've got" — prompts for the actual count. */
  isMinimum: boolean
}

/** Generator output. Never stored; re-derived whenever inputs change. */
export interface SessionTemplate {
  index: number // 1-based
  type: SessionType
  sets: SetTemplate[]
  /** The strength the session was planned around, if the generator models one. */
  predictedMax?: number
}

/**
 * Per-set check-offs for the one session currently in progress — sets can be
 * spread across the day (one in the morning, two at lunch, …). Cleared the
 * moment the last set lands and the session becomes an immutable Result.
 */
export interface SessionProgress {
  sessionIndex: number
  /** Actual per set, aligned with the session's sets; null = not done yet. */
  actuals: (number | null)[]
}

export interface Plan {
  id: string
  exerciseId: string
  generatorId: string
  /**
   * Generator-specific, driven by its paramFields. Convention required by the
   * core scheduler: must contain `sessionsPerWeek`.
   */
  params: Record<string, number>
  status: 'active' | 'archived'
  startDate: string // yyyy-mm-dd
  createdAt: string
  stoppedAt?: string
  calibrations: CalibrationPoint[]
  /** Manual per-day edits, keyed by session index. Survive re-derivation. */
  overrides: Record<number, { sets: SetTemplate[] }>
  /** Sets checked off so far in the due session, at most one at a time. */
  progress?: SessionProgress
}

export interface ResultSet {
  target: number
  isMinimum: boolean
  actual: number
}

/**
 * Snapshot written when a session is completed. Immutable except for a short
 * grace window after finishing (see `isResultEditable`): the actual counts can
 * be corrected until 24h have passed, for fat-finger fixes on the day.
 */
export interface Result {
  id: string
  planId: string
  sessionIndex: number
  date: string // yyyy-mm-dd
  sessionType: SessionType
  sets: ResultSet[]
  /** When the session was logged (ISO date-time). Drives the 24h edit window.
   * Optional: results logged before this field existed fall back to `date`. */
  completedAt?: string
}

export interface AppData {
  version: 1
  exercises: Exercise[]
  plans: Plan[]
  results: Result[]
}

/** Declarative param schema; the plan-creation form renders itself from this. */
export interface ParamField {
  key: string
  label: string
  min: number
  max: number
  step: number
  defaultValue: number
}

export interface Generator {
  id: string
  name: string
  description: string
  paramFields: ParamField[]
  generate(
    params: Record<string, number>,
    calibrations: CalibrationPoint[],
  ): SessionTemplate[]
}
