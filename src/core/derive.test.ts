import { describe, expect, it } from 'vitest'
import { countDone, derivePlanView, effectiveSession, fitProgress, isResultEditable, partialToClose } from './derive'
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
    // Session 1 was done on schedule, session 2 was due 07-22; today is 07-26
    // → the floor lands it today, and the rest slides the same 4 days.
    const view = derivePlanView(plan, [result(1, '2026-07-20')], '2026-07-26')
    expect(view.due?.index).toBe(2)
    expect(view.due?.date).toBe('2026-07-26')
    expect(view.sessions[2].date).toBe('2026-07-28')
    expect(view.sessions[0].date).toBe('2026-07-20') // completed: untouched
    // Base end = start + 13 weeks = 2026-10-19; slides with the 4-day gap —
    // and one more day for every day the due session sits undone.
    expect(view.endDate).toBe('2026-10-23')
    expect(derivePlanView(plan, [result(1, '2026-07-20')], '2026-07-27').endDate).toBe('2026-10-24')
  })

  it('re-anchors the schedule to a late completion — no catch-up', () => {
    // Session 1 (due 07-20) was completed 6 days late, on 07-26. Session 2
    // keeps its 2-day spacing from the day session 1 actually happened —
    // 07-28, not tomorrow — and the whole plan ends 6 days later, for good.
    const view = derivePlanView(plan, [result(1, '2026-07-26')], '2026-07-26')
    expect(view.completedToday).toBe(true)
    expect(view.due).toBeNull()
    expect(view.next?.index).toBe(2)
    expect(view.next?.date).toBe('2026-07-28')
    // Base end = 2026-10-19 + the full 6-day delay.
    expect(view.endDate).toBe('2026-10-25')
  })

  it('carries delays cumulatively, always keeping the base spacing', () => {
    // Session 1 done 3 days late (07-23), session 2 another 2 days beyond its
    // anchored day (07-27 instead of 07-25) — 5 days of delay in total.
    const done = [result(1, '2026-07-23'), result(2, '2026-07-27')]
    const view = derivePlanView(plan, done, '2026-07-28')
    // Session 3 keeps its 2-day spacing from 07-27 — never "tomorrow to catch up".
    expect(view.due).toBeNull()
    expect(view.next?.index).toBe(3)
    expect(view.next?.date).toBe('2026-07-29')
    // The 3-day base gap between sessions 3 and 4 (07-24 → 07-27) survives.
    expect(view.sessions[3].date).toBe('2026-08-01')
    expect(view.endDate).toBe('2026-10-24') // base end + 5, permanently
  })

  it('dates a started session by its first check-off, making it due early', () => {
    // Session 2 is scheduled for 07-22; on 07-21 the user pulled it forward
    // and logged a set — it happens today, and stays due across reloads.
    const p: Plan = { ...plan, progress: { sessionIndex: 2, actuals: [5, null], startedOn: '2026-07-21' } }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-07-21')
    expect(view.due?.index).toBe(2)
    expect(view.due?.progress?.[0]).toBe(5)
    expect(view.due?.date).toBe('2026-07-21') // the day it is happening
    expect(view.due?.scheduledDate).toBe('2026-07-22') // the day the plan said
  })

  it('pull-forward intent alone (started, no sets yet) makes the session due', () => {
    // "Do it today" stores empty progress; nothing else distinguishes a pull.
    const p: Plan = {
      ...plan,
      progress: { sessionIndex: 2, actuals: [null, null, null, null], startedOn: '2026-07-21' },
    }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-07-21')
    expect(view.due?.index).toBe(2)
    expect(view.due?.date).toBe('2026-07-21')
  })

  it('keeps a pulled session due today when the schedule puts it later ("go again")', () => {
    // Session 1 was completed late, today (07-26); the anchor puts session 2
    // two days out. Pulling it the same day overrides: startedOn wins, while
    // scheduledDate keeps the anchored projection honest.
    const p: Plan = {
      ...plan,
      progress: { sessionIndex: 2, actuals: [null, null, null, null], startedOn: '2026-07-26' },
    }
    const view = derivePlanView(p, [result(1, '2026-07-26')], '2026-07-26')
    expect(view.completedToday).toBe(true)
    expect(view.due?.index).toBe(2)
    expect(view.due?.date).toBe('2026-07-26')
    expect(view.due?.scheduledDate).toBe('2026-07-28')
  })

  it('clamps a future startedOn to today, so a clock moved backward cannot lock the session out', () => {
    // Pulled forward just after midnight, then the device day rolled back
    // (timezone travel): without the clamp the session is neither due nor
    // sweepable — stuck upcoming, blocking a new pull, until the calendar
    // catches up.
    const p: Plan = { ...plan, progress: { sessionIndex: 2, actuals: [5, null], startedOn: '2026-07-22' } }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-07-21')
    expect(view.due?.index).toBe(2)
    expect(view.due?.date).toBe('2026-07-21')
  })

  it('never promotes a session past the first incomplete one, progress or not', () => {
    const p: Plan = { ...plan, progress: { sessionIndex: 3, actuals: [5], startedOn: '2026-07-21' } }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-07-21')
    expect(view.due).toBeNull()
    expect(view.sessions[2].status).toBe('upcoming')
    expect(view.sessions[2].date).toBe('2026-07-24') // keeps its scheduled day
  })

  it('pulls the rest of the schedule earlier after an early double day', () => {
    // Two Results on one day — the state a completed pull leaves behind (the
    // pull record itself is gone by now). The tail re-anchors to the early
    // completion: session 3 keeps its 2-day spacing from 07-20 and the whole
    // plan ends 2 days sooner. Nothing new becomes due today, though — doing
    // more is explicit, never automatic.
    const done = [result(1, '2026-07-20'), result(2, '2026-07-20')]
    const view = derivePlanView(plan, done, '2026-07-20')
    expect(view.completedToday).toBe(true)
    expect(view.due).toBeNull()
    expect(view.next?.index).toBe(3)
    expect(view.next?.date).toBe('2026-07-22') // two days before its base Friday
    expect(view.endDate).toBe('2026-10-17') // the base end − 2
  })

  it('does not move the tail for a pending pull — only a Result moves the anchor', () => {
    // Session 2 pulled to 07-21 but not completed: it happens today, while
    // session 3 keeps its base day until the pull becomes a Result.
    const p: Plan = { ...plan, progress: { sessionIndex: 2, actuals: [null, null], startedOn: '2026-07-21' } }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-07-21')
    expect(view.sessions[1].date).toBe('2026-07-21')
    expect(view.sessions[2].date).toBe('2026-07-24')
    expect(view.endDate).toBe('2026-10-19')
  })

  it('treats a skipped session as settled: never due, schedule unmoved when the anchor was on time', () => {
    // Session 2's Result was deleted; deleteResult marked it skipped.
    const p: Plan = { ...plan, skipped: [2] }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-07-24')
    expect(view.sessions[1].status).toBe('skipped')
    expect(view.due?.index).toBe(3)
    expect(view.sessions[2].date).toBe('2026-07-24')
    expect(view.completedCount).toBe(1)
  })

  it('anchors across a skipped slot, which consumes its spacing', () => {
    // Session 1 done 3 days late, session 2 skipped: session 3 lands the full
    // slot-1→slot-3 distance (4 days) after the anchor, not 2 days after it.
    const p: Plan = { ...plan, skipped: [2] }
    const view = derivePlanView(p, [result(1, '2026-07-23')], '2026-07-24')
    expect(view.due).toBeNull()
    expect(view.next?.index).toBe(3)
    expect(view.sessions[2].date).toBe('2026-07-27')
    expect(view.endDate).toBe('2026-10-22') // base end + 3
  })

  it('re-anchors to the previous Result when the newest one is deleted', () => {
    // Session 2 was done late, then its Result was deleted: the future
    // re-derives from session 1's on-time day, floored at today — deleting
    // the newest fact moves the anchor back to the one before it.
    const p: Plan = { ...plan, skipped: [2] }
    const view = derivePlanView(p, [result(1, '2026-07-20')], '2026-08-02')
    expect(view.due?.index).toBe(3)
    expect(view.due?.date).toBe('2026-08-02')
    expect(view.endDate).toBe('2026-10-28') // base end + the 9 days behind
  })

  it('anchors a future-dated Result at today, so a backward clock cannot lock the plan out', () => {
    // Logged with the device clock a month ahead, then the clock was fixed:
    // the session counts as done today, and the plan stays reachable.
    const view = derivePlanView(plan, [result(1, '2026-09-09')], '2026-08-09')
    expect(view.due).toBeNull()
    expect(view.next?.index).toBe(2)
    expect(view.next?.date).toBe('2026-08-11') // today + the 2-day spacing
  })

  it('falls back to the base layout when everything before is skipped', () => {
    // No Result exists to anchor on — the walk-back must cope, not crash.
    const p: Plan = { ...plan, skipped: [1, 2] }
    const view = derivePlanView(p, [], '2026-07-25')
    expect(view.due?.index).toBe(3)
    expect(view.due?.date).toBe('2026-07-25') // base 07-24 floored at today
    expect(view.endDate).toBe('2026-10-20')
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
    // plannedSets stay the generator's — the chart's planned line must not
    // follow a day-of adjustment onto the done dot.
    expect(s2.plannedSets).toEqual(effectiveSession(plan, 2)!.sets)
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

  it('derives a fully completed plan: nothing due, nothing next', () => {
    // Regression: with no progress and no incomplete session, the started-early
    // lookup compared undefined === undefined and crashed on plan completion.
    const total = derivePlanView(plan, [], '2026-07-20').sessions.length
    const done = Array.from({ length: total }, (_, i) => result(i + 1, '2026-07-20'))
    const view = derivePlanView(plan, done, '2026-10-20')
    expect(view.due).toBeNull()
    expect(view.next).toBeNull()
    expect(view.completedCount).toBe(total)
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

describe('partialToClose', () => {
  // Pin session 1's sets so the expectations don't depend on generator math.
  const sets = [
    { target: 5, isMinimum: false },
    { target: 6, isMinimum: false },
    { target: 7, isMinimum: false },
    { target: 8, isMinimum: true },
  ]
  const partial = (overrides: Partial<Plan> = {}): Plan => ({
    ...plan,
    overrides: { 1: { sets } },
    progress: { sessionIndex: 1, actuals: [10, 6, null, null], startedOn: '2026-07-20' },
    ...overrides,
  })

  it('closes a past-day partial: done sets keep their reps, missed sets stay null', () => {
    const close = partialToClose(partial(), '2026-07-21')
    expect(close).toEqual({
      sessionIndex: 1,
      sessionType: 'normal',
      sets,
      actuals: [10, 6, null, null], // null = never attempted; commit records 0
      date: '2026-07-20', // the day the reps happened, not the sweep day
    })
  })

  it('returns null while the partial is still on its own day', () => {
    expect(partialToClose(partial(), '2026-07-20')).toBeNull()
  })

  it('returns null without progress or without a date stamp', () => {
    expect(partialToClose(plan, '2026-07-21')).toBeNull()
    const unstamped = partial({ progress: { sessionIndex: 1, actuals: [10, null, null, null] } })
    expect(partialToClose(unstamped, '2026-07-21')).toBeNull()
  })

  it('returns null when no set was done at all — untouched, not partial', () => {
    const untouched = partial({
      progress: { sessionIndex: 1, actuals: [null, null, null, null], startedOn: '2026-07-20' },
    })
    expect(partialToClose(untouched, '2026-07-21')).toBeNull()
  })

  it('returns null for a session index the generator no longer produces', () => {
    const gone = partial({
      progress: { sessionIndex: 999, actuals: [10], startedOn: '2026-07-20' },
    })
    expect(partialToClose(gone, '2026-07-21')).toBeNull()
  })

  it('keeps the done measuring set of a test — commit calibrates from it', () => {
    // Session 12 is the first mid-plan max test (13w × 3/wk).
    const test = partial({
      overrides: {},
      progress: { sessionIndex: 12, actuals: [17], startedOn: '2026-07-20' },
    })
    const close = partialToClose(test, '2026-07-21')
    expect(close?.sessionType).toBe('test')
    expect(close?.actuals).toEqual([17])
  })

  it('keeps an unattempted measuring set null — commit skips calibration', () => {
    // An override added a warm-up set to the test day; only that one was done.
    const test = partial({
      overrides: { 12: { sets: [{ target: 17, isMinimum: false }, { target: 5, isMinimum: false }] } },
      progress: { sessionIndex: 12, actuals: [null, 5], startedOn: '2026-07-20' },
    })
    const close = partialToClose(test, '2026-07-21')
    expect(close?.sessionType).toBe('test')
    expect(close?.actuals).toEqual([null, 5])
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

describe('countDone', () => {
  it('counts checked-off sets, zero included', () => {
    expect(countDone([7, null, null])).toBe(1)
    expect(countDone([0, 5])).toBe(2) // a logged 0 is done, not missing
    expect(countDone([null, null])).toBe(0)
    expect(countDone(undefined)).toBe(0)
  })
})
