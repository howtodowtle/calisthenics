import { describe, expect, it } from 'vitest'
import { derivePlanView } from './derive'
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

  it('keeps completed sessions as facts when params change', () => {
    const done = [result(1, '2026-07-20'), result(2, '2026-07-22')]
    const changed: Plan = { ...plan, params: { ...plan.params, targetMax: 50 } }
    const view = derivePlanView(changed, done, '2026-07-23')
    expect(view.sessions[0].result).toBe(done[0])
    expect(view.completedCount).toBe(2)
  })
})
