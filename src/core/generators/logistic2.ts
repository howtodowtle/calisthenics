import { flooredMax } from '../stats'
import type {
  CalibrationPoint,
  Generator,
  SessionTemplate,
  SessionType,
  SetTemplate,
} from '../types'

/**
 * `logistic-v2` — moderate-volume successor to `logistic-v1`.
 *
 * What changed and why (v1 prescribed 105–239% of the predicted max per
 * session and single sets up to 105% — too much, too hard):
 * - Every session is built from that day's **predicted max** and lands at
 *   ~140–160% of it, split into 4 sets. No difficulty multiplier.
 * - The first session of each week is the one heavier day: top set capped at
 *   85% of predicted max (floor-rounded so the cap really holds), the rest
 *   easy. Other days are ~4 × 40% with a slight wave, alternating between two
 *   patterns.
 * - No AMRAP outside tests — every non-test set is a fixed target.
 * - The predicted-max curve is a **Gompertz** sigmoid from startMax to
 *   targetMax, normalized to pass exactly through both endpoints. Gompertz
 *   instead of a symmetric logistic because gains aren't symmetric: they come
 *   fast early (neural adaptation, form efficiency) and then grind slowly
 *   toward the ceiling. The inflection sits at ~35% of the span rather than
 *   50%, so the steep phase lands in the first half and the back half is a
 *   long, realistic approach — a symmetric logistic instead claims the
 *   biggest jumps mid-plan, where there's no mechanism for them.
 * - Calibration **re-anchors**: after a test, the future is a fresh Gompertz
 *   from the test result to targetMax over the remaining sessions — no decay
 *   back to the old trajectory. Anchoring is piecewise per test, so sessions
 *   before a later test keep the curve they were generated from. A result at
 *   or above targetMax holds the curve flat at that result. The early-
 *   inflection shape composes well with re-anchoring: each segment pushes in
 *   the fresh weeks right after a test + recovery and eases as the next test
 *   approaches — a built-in mini-taper. (A symmetric curve would restart slow
 *   after every test and shove the steepness ever later.)
 * - The plan **opens with a max test** (session 1, predicted = startMax):
 *   measure the real max first, then train from it — logging it re-anchors
 *   the whole curve immediately. A recovery session follows, as after any
 *   other test.
 * - Mid-plan test cadence, taper (×0.6) and recovery (×0.85) days are
 *   unchanged from v1; taper/recovery always use the easy shape, never the
 *   heavy set.
 *
 * Every session carries `predictedMax` so the UI can print and plot the curve.
 * It is the true (float) curve value and drives all set math; display floors
 * it via `flooredMax` — 11.9 reps is still only 11, never 12.
 *
 * The id keeps the historical `logistic-v2` name — ids are opaque and stable,
 * and this one shipped in the store migration before the curve became Gompertz.
 */

const CURVE_K = 0.15 // steepness at the reference span; scaled to keep the shape length-invariant
const CURVE_SPAN = 39 // reference span the steepness was tuned at (13 weeks × 3/week → 39 intervals)
const INFLECTION = 0.35 // fraction of the span where growth peaks (Gompertz asymmetry)

type Rounding = 'round' | 'floor'

interface DayTemplate {
  fractions: number[]
  rounding: Rounding[]
}

const DAY_TEMPLATES: Record<'heavy' | 'easyA' | 'easyB', DayTemplate> = {
  // warm-up, capped top set, two easy closers — ~145% of predicted max
  heavy: { fractions: [0.2, 0.85, 0.2, 0.2], rounding: ['round', 'floor', 'round', 'round'] },
  // ~4 × 40% with a slight wave — ~160%
  easyA: { fractions: [0.4, 0.45, 0.4, 0.35], rounding: ['round', 'round', 'round', 'round'] },
  // alternate wave — ~155%
  easyB: { fractions: [0.35, 0.4, 0.45, 0.35], rounding: ['round', 'round', 'round', 'round'] },
}

const REDUCTION: Partial<Record<SessionType, number>> = {
  taper: 0.6,
  recovery: 0.85,
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function predictedMaxAt(
  n: number,
  startMax: number,
  targetMax: number,
  totalSessions: number,
  calibrations: CalibrationPoint[],
): number {
  // Anchor: the latest test strictly before session n. The test session itself
  // is still governed by the previous anchor (its target was the prediction).
  let anchorSession = 1
  let anchorValue = startMax
  for (const c of calibrations) {
    if (c.sessionIndex < n && c.sessionIndex >= anchorSession) {
      anchorSession = c.sessionIndex
      anchorValue = clamp(c.actual, 1, 500)
    }
  }
  if (anchorValue >= targetMax) return anchorValue
  const logEnd = totalSessions - 1
  if (anchorSession >= logEnd) return anchorValue
  const span = logEnd - anchorSession
  const k = CURVE_K * (CURVE_SPAN / span)
  const t0 = anchorSession + INFLECTION * span
  const gompertz = (x: number) => Math.exp(-Math.exp(-k * (x - t0)))
  // Normalize so the curve hits anchorValue at the anchor and targetMax at the
  // last pre-test session exactly (the final test then sits at targetMax too).
  const lo = gompertz(anchorSession)
  const hi = gompertz(logEnd)
  const progress = clamp((gompertz(n) - lo) / (hi - lo), 0, 1)
  return anchorValue + (targetMax - anchorValue) * progress
}

// The v1 layout (final test + taper before it, mid-plan tests at the end of
// every 3rd week from week 4 while ≥3 weeks remain, each flanked by a taper
// and a recovery session) plus an opening max test as session 1.
function sessionTypes(weeks: number, perWeek: number): SessionType[] {
  const total = weeks * perWeek + 1
  const types: SessionType[] = new Array(total).fill('normal')
  types[total - 1] = 'test'
  if (total >= 2) types[total - 2] = 'taper'
  for (let w = 4; w <= weeks - 3; w += 3) {
    const testIdx = w * perWeek - 1
    types[testIdx] = 'test'
    if (testIdx >= 1 && types[testIdx - 1] === 'normal') types[testIdx - 1] = 'taper'
    if (types[testIdx + 1] === 'normal') types[testIdx + 1] = 'recovery'
  }
  // Opening max test: measure the real max before training from it. Recovery
  // follows like after any other test (a taper there outranks it on tiny plans).
  types[0] = 'test'
  if (types[1] === 'normal') types[1] = 'recovery'
  return types
}

function pickTemplate(type: SessionType, dayInWeek: number): DayTemplate {
  // Taper/recovery days always use the easy shape — no heavy set next to a test.
  if (type !== 'normal') return DAY_TEMPLATES.easyA
  if (dayInWeek === 1) return DAY_TEMPLATES.heavy
  return dayInWeek % 2 === 0 ? DAY_TEMPLATES.easyA : DAY_TEMPLATES.easyB
}

function buildSets(trueMax: number, type: SessionType, dayInWeek: number): SetTemplate[] {
  // A test's target is the prediction the user sees, so it uses the floored max.
  if (type === 'test') return [{ target: flooredMax(trueMax), isMinimum: false }]
  const base = trueMax * (REDUCTION[type] ?? 1)
  const tpl = pickTemplate(type, dayInWeek)
  return tpl.fractions.map((fraction, i) => ({
    target: Math.max(1, Math[tpl.rounding[i]](fraction * base)),
    isMinimum: false,
  }))
}

export const logisticV2: Generator = {
  id: 'logistic-v2',
  name: 'Gompertz progression',
  description:
    'Opens with a max test, then four submaximal sets per session (~150% of predicted ' +
    'max total), one heavier day per week capped at 85%. Max test every 3 weeks ' +
    're-anchors the curve.',
  paramFields: [
    { key: 'startMax', label: 'Current max', min: 1, max: 500, step: 1, defaultValue: 10 },
    { key: 'targetMax', label: 'Target max', min: 1, max: 500, step: 1, defaultValue: 100 },
    { key: 'weeks', label: 'Weeks', min: 2, max: 52, step: 1, defaultValue: 13 },
    { key: 'sessionsPerWeek', label: 'Sessions per week', min: 1, max: 7, step: 1, defaultValue: 3 },
  ],
  generate(params, calibrations): SessionTemplate[] {
    const startMax = clamp(Math.round(params.startMax ?? 10), 1, 500)
    const targetMax = clamp(Math.round(params.targetMax ?? startMax), startMax, 500)
    const weeks = clamp(Math.round(params.weeks ?? 13), 2, 52)
    const perWeek = clamp(Math.round(params.sessionsPerWeek ?? 3), 1, 7)
    const total = weeks * perWeek + 1
    const types = sessionTypes(weeks, perWeek)

    return types.map((type, i) => {
      const n = i + 1
      const max = predictedMaxAt(n, startMax, targetMax, total, calibrations)
      return { index: n, type, predictedMax: max, sets: buildSets(max, type, (i % perWeek) + 1) }
    })
  },
}
