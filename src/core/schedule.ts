import { addDays, daysBetween } from './dates'

/**
 * Maps the session sequence onto calendar dates.
 *
 * Base layout: sessions spread evenly within each week from the plan start
 * date (3/week → day offsets 0, 2, 4 — a Mon/Wed/Fri feel).
 *
 * Shift-forward: the remaining schedule slides forward so the first
 * incomplete session lands no earlier than a caller-chosen day (the end date
 * moves). The caller owns the policy of what that day is — `derive.ts` floors
 * it at tomorrow once today's session is logged. Nothing is stored;
 * `shiftedDates` is the single place a smarter rescheduler would plug in later.
 */

/**
 * Reads `sessionsPerWeek` off a params blob — the one field the core requires
 * of every generator (see Plan.params in types.ts) — clamped to the same 1–7
 * range the generators themselves enforce.
 */
export function perWeekOf(params: Record<string, number>): number {
  return Math.min(7, Math.max(1, Math.round(params.sessionsPerWeek ?? 3)))
}

/** 0-based week a session index falls in. */
export const weekOf = (i: number, perWeek: number): number => Math.floor(i / perWeek)

export function baseDates(startDate: string, total: number, perWeek: number): string[] {
  const offsets = Array.from({ length: perWeek }, (_, d) => Math.floor((d * 7) / perWeek))
  return Array.from({ length: total }, (_, i) => {
    const day = i % perWeek
    return addDays(startDate, weekOf(i, perWeek) * 7 + offsets[day])
  })
}

/**
 * Scheduled (display) date per session, 0-based array aligned with sessions.
 * `firstIncomplete` is the 0-based index of the first session without a
 * result; pass `total` when everything is done. `earliest` is the first day
 * that session may land on — the caller decides what that is.
 */
export function shiftedDates(
  base: string[],
  firstIncomplete: number,
  earliest: string,
): string[] {
  if (firstIncomplete >= base.length) return base
  const gap = Math.max(0, daysBetween(base[firstIncomplete], earliest))
  if (gap === 0) return base
  return base.map((d, i) => (i < firstIncomplete ? d : addDays(d, gap)))
}
