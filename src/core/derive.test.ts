import { describe, expect, it } from 'vitest'
import { derivePlanView, effectiveSession, fitProgress, isResultEditable } from './derive'
import type { Plan, Result } from './types'

const plan: Plan = {
  id: 'p1',
  exerciseId: 'e1',
  generatorId: 'logistic-v1',
  params: { startMax: 10, targetMax: 100, weeks: 13, sessionsPerWeek: 3 },
  status: 'active',
  startDate: '2026-07-20',
  createdAt: '2026-07-18T00:00:00Z',
  calibrations: [],
  overrides: {},
}

function result(sessionIndex: number, date: string): Result {
  return {
    id: `r${sessionIndex}`,
    planId: 'p1',
    sessionIndex,
    date,
    sessionType: 'normal',
    sets: [{ target: 5, isMinimum: false, actual: 5 }],
  }
}

describe('derivePlanView', () => {
  it('marks the first session due on the start date', () => {
    const view = derivePlanView(plan, [], '2026-07-20')
    expect(view.due?.index).toBe(1)
    expect(view.sessions.filter((s) => s.status === 'due')).toHaveLength(1)
  })

  it('shows rest state (next, no due) between sessions', () => {
    const view = derivePlanView(plan, [result(1, '2026-07-20')], '2026-07-21')
    expect(view.due).toBeNull()
    expect(view.next?.index).toBe(2)
    expect(view.next?.date).toBe('2026-07-22')
  })

  it('shifts the remaining schedule when behind', () => {
    // Session 2 was due 07-22; today is 07-26 → due today, rest slides 4 days.
    const view = derivePlanView(plan, [result(1, '2026-07-20')], '2026-07-26')
    expect(view.due?.index).toBe(2)
    expect(view.due?.date).toBe('2026-07-26')
    expect(view.sessions[2].date).toBe('2026-07-28')
    expect(view.sessions[0].date).toBe('2026-07-20') // completed: untouched
    // Base end = start + 13 weeks = 2026-10-19; slides with the 4-day gap.
    expect(view.endDate).toBe('2026-10-23')
  })

  it('applies overrides and flags the session as edited', () => {
    const edited: Plan = {
      ...plan,
      overrides: { 2: { sets: [{ target: 99, isMinimum: false }] } },
    }
    const view = derivePlanView(edited, [], '2026-07-20')
    const s2 = view.sessions[1]
    expect(s2.overridden).toBe(true)
    expect(s2.sets[0].target).toBe(99)
  })

  it('exposes per-set progress on the in-progress session, sized to its sets', () => {
    const p: Plan = { ...plan, progress: { sessionIndex: 1, actuals: [10, null] } }
    const view = derivePlanView(p, [], '2026-07-20')
    expect(view.due?.progress).toHaveLength(view.due!.sets.length)
    expect(view.due?.progress?.[0]).toBe(10)
    expect(view.due?.progress?.[1]).toBeNull()
    // Progress belongs to exactly one session.
    expect(view.sessions[1].progress).toBeUndefined()
  })

  it('drops progress from a session that already has a result', () => {
    const p: Plan = { ...plan, progress: { sessionIndex: 1, actuals: [10] } }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-07-21')
    expect(view.sessions[0].progress).toBeUndefined()
  })

  it('keeps completed sessions as facts when params change', () => {
    const done = [result(1, '2026-07-20'), result(2, '2026-07-22')]
    const changed: Plan = { ...plan, params: { ...plan.params, targetMax: 50 } }
    const view = derivePlanView(changed, done, '2026-07-23')
    expect(view.sessions[0].result).toBe(done[0])
    expect(view.completedCount).toBe(2)
  })
})

describe('effectiveSession', () => {
  it('matches derivePlanView, applies overrides, null for unknown index', () => {
    const s2 = derivePlanView(plan, [], '2026-07-20').sessions[1]
    expect(effectiveSession(plan, 2)).toEqual({ type: s2.type, sets: s2.sets })
    const edited: Plan = {
      ...plan,
      overrides: { 2: { sets: [{ target: 99, isMinimum: false }] } },
    }
    expect(effectiveSession(edited, 2)?.sets).toEqual([{ target: 99, isMinimum: false }])
    expect(effectiveSession(plan, 999)).toBeNull()
  })
})

describe('isResultEditable', () => {
  const at = (completedAt: string): Result => ({ ...result(1, '2026-07-20'), completedAt })
  const t = (iso: string) => Date.parse(iso)

  it('keeps a result editable within 24h of completion', () => {
    const r = at('2026-07-20T09:00:00Z')
    expect(isResultEditable(r, t('2026-07-20T10:00:00Z'), '2026-07-20')).toBe(true)
    // 23h59m later — still inside the window, even on the next calendar day.
    expect(isResultEditable(r, t('2026-07-21T08:59:00Z'), '2026-07-21')).toBe(true)
  })

  it('freezes a result once 24h have passed', () => {
    const r = at('2026-07-20T09:00:00Z')
    expect(isResultEditable(r, t('2026-07-21T09:00:01Z'), '2026-07-21')).toBe(false)
  })

  it('falls back to same-calendar-day for legacy results without completedAt', () => {
    const legacy = result(1, '2026-07-20') // no completedAt
    expect(isResultEditable(legacy, t('2026-07-20T23:59:00Z'), '2026-07-20')).toBe(true)
    expect(isResultEditable(legacy, t('2026-07-21T00:01:00Z'), '2026-07-21')).toBe(false)
  })
})

describe('fitProgress', () => {
  it('pads short progress with nulls and trims long progress', () => {
    expect(fitProgress([7, null], 4)).toEqual([7, null, null, null])
    expect(fitProgress([1, 2, 3, 4], 2)).toEqual([1, 2])
    expect(fitProgress([], 3)).toEqual([null, null, null])
  })
})
