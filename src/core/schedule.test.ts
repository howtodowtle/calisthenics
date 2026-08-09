import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, todayISO } from './dates'
import { anchoredDates, baseDates } from './schedule'

describe('dates', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-07-18', -1)).toBe('2026-07-17')
  })

  it('computes day differences', () => {
    expect(daysBetween('2026-07-18', '2026-07-21')).toBe(3)
    expect(daysBetween('2026-07-21', '2026-07-18')).toBe(-3)
  })

  it('formats today as yyyy-mm-dd', () => {
    expect(todayISO(new Date(2026, 6, 18, 23, 59))).toBe('2026-07-18')
    expect(todayISO(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02')
  })
})

describe('baseDates', () => {
  it('spreads 3/week as Mon/Wed/Fri-style offsets 0,2,4', () => {
    expect(baseDates('2026-07-20', 7, 3)).toEqual([
      '2026-07-20', '2026-07-22', '2026-07-24',
      '2026-07-27', '2026-07-29', '2026-07-31',
      '2026-08-03',
    ])
  })

  it('spreads 2/week as offsets 0,3', () => {
    expect(baseDates('2026-07-20', 4, 2)).toEqual([
      '2026-07-20', '2026-07-23', '2026-07-27', '2026-07-30',
    ])
  })

  it('handles the final +1 test session landing in its own week', () => {
    const dates = baseDates('2026-07-20', 2 * 3 + 1, 3)
    expect(dates[6]).toBe(addDays('2026-07-20', 14))
  })
})

describe('anchoredDates (re-anchoring to the last completed session)', () => {
  // Base intervals: 2, 2, 3 days.
  const base = ['2026-07-20', '2026-07-22', '2026-07-24', '2026-07-27']

  it('keeps the base layout without an anchor, never pulled before its own start', () => {
    expect(anchoredDates(base, 0, null, '2026-07-19')).toEqual(base)
    expect(anchoredDates(base, 0, null, '2026-07-20')).toEqual(base)
  })

  it('floors an anchorless overdue start at earliest', () => {
    expect(anchoredDates(base, 0, null, '2026-07-23')).toEqual([
      '2026-07-23', '2026-07-25', '2026-07-27', '2026-07-30',
    ])
  })

  it('does not shift when the anchor completed on schedule', () => {
    expect(anchoredDates(base, 1, { position: 0, date: '2026-07-20' }, '2026-07-21')).toEqual(base)
  })

  it('shifts the whole tail by a late anchor, keeping the base intervals', () => {
    // Session 1 was done 5 days late → everything after moves 5 days, for good.
    expect(anchoredDates(base, 1, { position: 0, date: '2026-07-25' }, '2026-07-26')).toEqual([
      '2026-07-20', '2026-07-27', '2026-07-29', '2026-08-01',
    ])
  })

  it('pulls the whole tail earlier after an early anchor', () => {
    // Session 2 was done a day early (07-21) → the rest lands before its base slot.
    expect(anchoredDates(base, 2, { position: 1, date: '2026-07-21' }, '2026-07-22')).toEqual([
      '2026-07-20', '2026-07-22', '2026-07-23', '2026-07-26',
    ])
  })

  it('floors a long-overdue landing at earliest, sliding a day per day', () => {
    const anchor = { position: 0, date: '2026-07-20' }
    expect(anchoredDates(base, 1, anchor, '2026-07-30')).toEqual([
      '2026-07-20', '2026-07-30', '2026-08-01', '2026-08-04',
    ])
    // One more day undone → the whole future is one more day out.
    expect(anchoredDates(base, 1, anchor, '2026-07-31')).toEqual([
      '2026-07-20', '2026-07-31', '2026-08-02', '2026-08-05',
    ])
  })

  it('lets a skipped slot between anchor and next consume its spacing', () => {
    // Slot 1 skipped, slot 0 done 3 days late: next lands anchor + the full
    // slot-0→slot-2 distance (4 days) — skipping never accelerates the plan.
    expect(anchoredDates(base, 2, { position: 0, date: '2026-07-23' }, '2026-07-24')).toEqual([
      '2026-07-20', '2026-07-22', '2026-07-27', '2026-07-30',
    ])
  })

  it('is a no-op when the plan is fully complete', () => {
    expect(anchoredDates(base, 4, { position: 3, date: '2026-09-01' }, '2026-09-02')).toEqual(base)
  })
})
