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
    const p = [plan('p1', 2)]
    const results = [result('2026-07-20'), result('2026-07-27')]
    expect(exerciseStats(results, p, '2026-07-27').streak).toBe(2)
    expect(exerciseStats([result('2026-07-20'), result('2026-07-28')], p, '2026-07-28').streak).toBe(1)
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
