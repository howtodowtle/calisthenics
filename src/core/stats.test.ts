import { describe, expect, it } from 'vitest'
import { exerciseStats, streakWindow } from './stats'
import type { Plan, Result } from './types'

function plan(id: string, sessionsPerWeek: number): Plan {
  return {
    id,
    exerciseId: 'e1',
    generatorId: 'logistic-v2',
    params: { startMax: 10, targetMax: 100, weeks: 13, sessionsPerWeek },
    status: 'active',
    startDate: '2026-07-20',
    createdAt: '2026-07-18T00:00:00Z',
    calibrations: [],
    overrides: {},
  }
}

function result(date: string, planId = 'p1'): Result {
  return {
    id: `${planId}:${date}`,
    planId,
    sessionIndex: 1,
    date,
    sessionType: 'normal',
    sets: [{ target: 5, isMinimum: false, actual: 5 }],
  }
}

describe('streakWindow', () => {
  it('is twice the average session spacing', () => {
    expect(streakWindow(plan('p1', 3))).toBeCloseTo(14 / 3) // ≈4.67
    expect(streakWindow(plan('p1', 7))).toBe(2)
  })

  it('caps at 7 days', () => {
    expect(streakWindow(plan('p1', 1))).toBe(7)
    expect(streakWindow(plan('p1', 2))).toBe(7)
  })

  it('falls back to 7 without a plan', () => {
    expect(streakWindow(undefined)).toBe(7)
  })
})

describe('exerciseStats streak', () => {
  const plans = [plan('p1', 3)] // window ≈4.67 days

  it('counts sessions within the window', () => {
    const results = [result('2026-07-20'), result('2026-07-24'), result('2026-07-27')]
    expect(exerciseStats(results, plans, '2026-07-27').streak).toBe(3)
  })

  it('breaks on a gap beyond the window', () => {
    // 5 days > 4.67 between the first two sessions.
    const results = [result('2026-07-20'), result('2026-07-25'), result('2026-07-27')]
    expect(exerciseStats(results, plans, '2026-07-27').streak).toBe(2)
  })

  it('dies once today is beyond the window of the last session', () => {
    const results = [result('2026-07-20'), result('2026-07-24')]
    expect(exerciseStats(results, plans, '2026-07-28').streak).toBe(2)
    expect(exerciseStats(results, plans, '2026-07-29').streak).toBe(0)
  })

  it('keeps the 7-day window at 2 sessions per week', () => {
    const results = [result('2026-07-20'), result('2026-07-27')]
    expect(exerciseStats(results, [plan('p1', 2)], '2026-07-27').streak).toBe(2)
  })

  it('judges each gap by the plan of the session that opened it', () => {
    // p1 (3/wk, window ≈4.67) → p2 (7/wk, window 2). The 4-day gap sits under
    // p1's window, so the cross-plan transition keeps the streak alive; the
    // next gap is under p2's tight window.
    const p = [plan('p1', 3), plan('p2', 7)]
    const results = [result('2026-07-20', 'p1'), result('2026-07-24', 'p2'), result('2026-07-26', 'p2')]
    expect(exerciseStats(results, p, '2026-07-26').streak).toBe(3)
    expect(exerciseStats(results, p, '2026-07-29').streak).toBe(0)
  })

  it('defaults to 7 days for results whose plan is unknown', () => {
    const results = [result('2026-07-20'), result('2026-07-27')]
    expect(exerciseStats(results, [], '2026-07-27').streak).toBe(2)
  })
})

describe('exerciseStats volume', () => {
  it('is all zero with no results and no plans', () => {
    const stats = exerciseStats([], [], '2026-07-27')
    expect(stats).toMatchObject({
      sessionsDone: 0,
      totalActual: 0,
      sessionsPerWeek: 0,
      actualPerWeek: 0,
      avgPerSession: 0,
      bestSession: 0,
      weeksTrained: 0,
      weeksSpan: 0,
    })
  })

  it('divides by every week since the first session when there is no plan', () => {
    // First session 2026-07-20, today 2026-08-03: week index 0,1,2 → 3 weeks elapsed.
    const results = [result('2026-07-20'), result('2026-07-27'), result('2026-08-03')]
    const stats = exerciseStats(results, [], '2026-08-03')
    expect(stats.weeksSpan).toBe(3)
    expect(stats.weeksTrained).toBe(3) // trained in all 3 weeks
    expect(stats.sessionsPerWeek).toBeCloseTo(1) // 3 sessions / 3 weeks
    expect(stats.actualPerWeek).toBeCloseTo(5) // 15 total actual / 3 weeks
    expect(stats.avgPerSession).toBe(5)
    expect(stats.bestSession).toBe(5)
  })

  it('anchors the denominator to the plan start, not just weeks actually trained', () => {
    // Plan started 2026-07-01; the one logged session is 19 days later, in
    // week index 2 (0-based) → 3 weeks have elapsed, but only 1 was trained.
    const p = [{ ...plan('p1', 3), startDate: '2026-07-01' }]
    const results = [result('2026-07-20')]
    const stats = exerciseStats(results, p, '2026-07-20')
    expect(stats.weeksSpan).toBe(3)
    expect(stats.weeksTrained).toBe(1)
    expect(stats.sessionsPerWeek).toBeCloseTo(1 / 3)
    expect(stats.actualPerWeek).toBeCloseTo(5 / 3)
  })

  it('counts the current week even on day one', () => {
    const results = [result('2026-07-20')]
    const stats = exerciseStats(results, [], '2026-07-20')
    expect(stats.weeksSpan).toBe(1)
    expect(stats.sessionsPerWeek).toBe(1)
    expect(stats.actualPerWeek).toBe(5)
    expect(stats.weeksTrained).toBe(1)
  })

  it('picks the highest single-session total as bestSession', () => {
    const results = [result('2026-07-20'), { ...result('2026-07-24'), sets: [{ target: 8, isMinimum: false, actual: 12 }] }]
    expect(exerciseStats(results, [], '2026-07-24').bestSession).toBe(12)
  })
})
