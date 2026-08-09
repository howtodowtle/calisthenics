import { describe, expect, it } from 'vitest'
import { previewPlan } from './derive'
import { countSessions, deriveOverview, OVERVIEW_DAYS } from './overview'
import type { AppData, Exercise, Plan, Result } from './types'

/**
 * A two-exercise app: push-ups 3×/week from Mon 2026-07-20 (offsets 0/2/4 →
 * Mon, Wed, Fri) and pull-ups 2×/week from the same Monday (offsets 0/3 →
 * Mon, Thu). Both use `logistic-v2`, so session 1 is a max test.
 */

const pushups: Exercise = {
  id: 'e-push',
  name: 'Push-ups',
  emoji: '💪',
  unit: 'reps',
  sortOrder: 0,
  createdAt: '2026-07-18T00:00:00Z',
}

const pullups: Exercise = { ...pushups, id: 'e-pull', name: 'Pull-ups', emoji: '🧗', sortOrder: 1 }

function plan(id: string, exerciseId: string, sessionsPerWeek: number): Plan {
  return {
    id,
    exerciseId,
    generatorId: 'logistic-v2',
    params: { startMax: 10, targetMax: 100, weeks: 13, sessionsPerWeek },
    status: 'active',
    startDate: '2026-07-20',
    createdAt: '2026-07-18T00:00:00Z',
    calibrations: [],
    overrides: {},
  }
}

function result(planId: string, sessionIndex: number, date: string): Result {
  return {
    id: `r-${planId}-${sessionIndex}`,
    planId,
    sessionIndex,
    date,
    sessionType: 'normal',
    sets: [{ target: 5, isMinimum: false, actual: 5 }],
    completedAt: `${date}T09:00:00Z`,
  }
}

function app(over: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    exercises: [pushups, pullups],
    plans: [plan('p-push', 'e-push', 3), plan('p-pull', 'e-pull', 2)],
    results: [],
    ...over,
  }
}

/** Days that actually carry sessions, as "date: exercise, exercise". */
const shape = (data: AppData, today: string): string[] =>
  deriveOverview(data, today)
    .filter((d) => d.entries.length > 0)
    .map((d) => `${d.date}: ${d.entries.map((e) => e.exercise.name).join(', ')}`)

describe('deriveOverview', () => {
  it('returns the whole window, rest days included as empty days', () => {
    const days = deriveOverview(app(), '2026-07-20')
    expect(days).toHaveLength(OVERVIEW_DAYS)
    expect(days.map((d) => d.date)).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ])
    // Tuesday is a rest day for both plans.
    expect(days[1].entries).toEqual([])
  })

  it('groups both exercises onto the days they fall on', () => {
    // Next Monday (07-27), where both plans line up again, is one day past
    // the window and correctly absent.
    expect(shape(app(), '2026-07-20')).toEqual([
      '2026-07-20: Push-ups, Pull-ups', // both start Monday
      '2026-07-22: Push-ups', // Wed
      '2026-07-23: Pull-ups', // Thu
      '2026-07-24: Push-ups', // Fri
    ])
  })

  it('orders a day by exercise display order, not plan order', () => {
    const reversed = app({ exercises: [pullups, { ...pushups, sortOrder: 5 }] })
    const [monday] = deriveOverview(reversed, '2026-07-20')
    expect(monday.entries.map((e) => e.exercise.name)).toEqual(['Pull-ups', 'Push-ups'])
  })

  it('drops completed sessions and keeps the rest of the day', () => {
    const done = app({ results: [result('p-push', 1, '2026-07-20')] })
    const [monday] = deriveOverview(done, '2026-07-20')
    expect(monday.entries.map((e) => e.exercise.name)).toEqual(['Pull-ups'])
  })

  it('files an overdue session under today, not its original date', () => {
    // Nothing logged; by Friday the Monday session has slid forward onto today.
    const [today] = deriveOverview(app(), '2026-07-24')
    expect(today.date).toBe('2026-07-24')
    expect(today.entries.map((e) => e.session.index)).toEqual([1, 1])
    expect(today.entries.every((e) => e.session.status === 'due')).toBe(true)
  })

  it('projects the anchored schedule, not the original calendar', () => {
    // Push-ups session 1 was done 2 days late (Wed instead of Mon): the whole
    // remaining schedule keeps its Mon/Wed/Fri spacing shifted 2 days — it
    // does not cram onto consecutive days to catch back up.
    const data = app({
      plans: [plan('p-push', 'e-push', 3)],
      results: [result('p-push', 1, '2026-07-22')],
    })
    expect(shape(data, '2026-07-23')).toEqual([
      '2026-07-24: Push-ups',
      '2026-07-26: Push-ups',
      '2026-07-29: Push-ups',
    ])
  })

  it('files an early-started session under today, not its scheduled day', () => {
    // Push-ups session 2 (Wed 07-22) was pulled forward on Tuesday and has a
    // set checked off — it is due, so it belongs to today.
    const data = app({
      plans: [{
        ...plan('p-push', 'e-push', 3),
        progress: { sessionIndex: 2, actuals: [5, null], startedOn: '2026-07-21' },
      }],
      results: [result('p-push', 1, '2026-07-20')],
    })
    const days = deriveOverview(data, '2026-07-21')
    expect(days[0].entries.map((e) => e.session.index)).toEqual([2])
    expect(days[1].entries).toEqual([]) // Wed 07-22 — the session moved to today
  })

  it('never shows a day twice for one exercise', () => {
    for (const day of deriveOverview(app(), '2026-07-20')) {
      const ids = day.entries.map((e) => e.exercise.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('ignores exercises without an active plan', () => {
    const archived = app({
      plans: [plan('p-push', 'e-push', 3), { ...plan('p-pull', 'e-pull', 2), status: 'archived' }],
    })
    expect(shape(archived, '2026-07-20')).toEqual(['2026-07-20: Push-ups', '2026-07-22: Push-ups', '2026-07-24: Push-ups'])
  })

  it('is empty when a plan has not started yet', () => {
    const later = app({ plans: [{ ...plan('p-push', 'e-push', 3), startDate: '2026-09-01' }] })
    expect(countSessions(deriveOverview(later, '2026-07-20'))).toBe(0)
  })

  it('is empty when every session is done', () => {
    // Derive the real total so "every" means every.
    const p = plan('p-push', 'e-push', 3)
    const total = previewPlan(p.generatorId, p.params, p.startDate, p.calibrations).count
    const finished = app({
      plans: [p],
      results: Array.from({ length: total }, (_, i) => result('p-push', i + 1, '2026-07-20')),
    })
    expect(countSessions(deriveOverview(finished, '2026-07-20'))).toBe(0)
  })

  it('carries the sets the UI renders, overrides included', () => {
    const edited = app({
      plans: [{ ...plan('p-push', 'e-push', 3), overrides: { 1: { sets: [{ target: 42, isMinimum: false }] } } }],
    })
    const [monday] = deriveOverview(edited, '2026-07-20')
    expect(monday.entries[0].session.sets).toEqual([{ target: 42, isMinimum: false }])
    expect(monday.entries[0].session.overridden).toBe(true)
  })
})

describe('countSessions', () => {
  it('totals across days, empty ones included', () => {
    expect(countSessions(deriveOverview(app(), '2026-07-20'))).toBe(5)
    expect(countSessions([])).toBe(0)
  })
})
