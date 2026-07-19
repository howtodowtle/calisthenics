import { describe, expect, it } from 'vitest'
import { flooredMax, sumTarget } from '../stats'
import { logisticV1 } from './logistic'
import { logisticV2 } from './logistic2'

const P = { startMax: 10, targetMax: 100, weeks: 13, sessionsPerWeek: 3 }

describe('logistic-v2 layout', () => {
  const plan = logisticV2.generate(P, [])

  it('opens with a max test + recovery, then keeps the v1 layout', () => {
    const v1 = logisticV1.generate(P, [])
    expect(plan[0].type).toBe('test')
    expect(plan[1].type).toBe('recovery')
    expect(plan.map((s) => s.type).slice(2)).toEqual(v1.map((s) => s.type).slice(2))
    expect(plan).toHaveLength(40)
  })

  it('the opening test is a single set at startMax', () => {
    expect(plan[0].sets).toEqual([{ target: 10, isMinimum: false }])
  })

  it('tests are a single set at the (floored) predicted max', () => {
    for (const s of plan.filter((x) => x.type === 'test')) {
      expect(s.sets).toEqual([{ target: flooredMax(s.predictedMax!), isMinimum: false }])
    }
  })

  it('has no AMRAP/minimum sets anywhere', () => {
    for (const s of plan) for (const set of s.sets) expect(set.isMinimum).toBe(false)
  })
})

describe('logistic-v2 predicted max curve', () => {
  const plan = logisticV2.generate(P, [])

  it('starts exactly at startMax and ends exactly at targetMax', () => {
    expect(plan[0].predictedMax).toBe(10)
    expect(plan[39].predictedMax).toBe(100)
    expect(plan[39].sets[0].target).toBe(100)
  })

  it('is monotone non-decreasing without calibration', () => {
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].predictedMax!).toBeGreaterThanOrEqual(plan[i - 1].predictedMax!)
    }
  })

  it('is steep-left (Gompertz): first third gains more than last third', () => {
    // Gains come fast early and grind slowly toward the ceiling — a symmetric
    // logistic would make these two roughly equal.
    const third = Math.floor(plan.length / 3)
    const firstThird = plan[third - 1].predictedMax! - plan[0].predictedMax!
    const lastThird = plan[plan.length - 1].predictedMax! - plan[plan.length - third].predictedMax!
    expect(firstThird).toBeGreaterThan(lastThird)
  })

  it('crosses the halfway value before the halfway session (inflection ~35%)', () => {
    const halfValue = (10 + 100) / 2
    const crossing = plan.findIndex((s) => s.predictedMax! >= halfValue)
    expect(crossing).toBeLessThan(plan.length / 2)
  })

  it('every session carries a predictedMax', () => {
    for (const s of plan) expect(s.predictedMax).toBeGreaterThanOrEqual(1)
  })
})

describe('logistic-v2 session volume', () => {
  const plan = logisticV2.generate(P, [])
  // Flat curve (start = target) keeps the true max at exactly 100, so set
  // patterns come out clean.
  const flat = logisticV2.generate({ ...P, startMax: 100, targetMax: 100 }, [])

  it('normal sessions land at ~140-160% of predicted max (rounding slack)', () => {
    for (const s of plan) {
      if (s.type !== 'normal' || s.predictedMax! < 25) continue
      const ratio = sumTarget(s.sets) / s.predictedMax!
      expect(ratio, `session ${s.index}`).toBeGreaterThanOrEqual(1.35)
      expect(ratio, `session ${s.index}`).toBeLessThanOrEqual(1.65)
    }
  })

  it('no non-test set exceeds 85% of the predicted max', () => {
    for (const s of plan) {
      if (s.type === 'test') continue
      for (const set of s.sets) {
        expect(set.target, `session ${s.index}`).toBeLessThanOrEqual(
          Math.max(1, 0.85 * s.predictedMax!),
        )
      }
    }
  })

  it('first normal day of the week is the heavy day; other days are the two easy waves', () => {
    // Week 1 is the opening max test + recovery, so the first heavy day is
    // week 2, day 1 (session 4): warm-up, capped top set, two easy closers.
    expect(flat[3].type).toBe('normal')
    expect(flat[3].sets.map((s) => s.target)).toEqual([20, 85, 20, 20])
    // Sessions 5 and 6 follow easy patterns A and B.
    expect(flat[4].sets.map((s) => s.target)).toEqual([40, 45, 40, 35])
    expect(flat[5].sets.map((s) => s.target)).toEqual([35, 40, 45, 35])
  })

  it('taper and recovery days scale the easy shape down and never go heavy', () => {
    for (const s of flat) {
      if (s.type !== 'taper' && s.type !== 'recovery') continue
      const reduction = s.type === 'taper' ? 0.6 : 0.85
      const expected = [0.4, 0.45, 0.4, 0.35].map((f) =>
        Math.max(1, Math.round(f * s.predictedMax! * reduction)),
      )
      expect(s.sets.map((x) => x.target), `session ${s.index}`).toEqual(expected)
    }
    expect(flat.filter((s) => s.type === 'taper').length).toBeGreaterThan(0)
  })
})

describe('logistic-v2 calibration (re-anchor)', () => {
  const uncal = logisticV2.generate(P, [])

  it('logging the opening max test re-anchors the whole curve', () => {
    const cal = logisticV2.generate(P, [{ sessionIndex: 1, actual: 20 }])
    // The test itself keeps its prediction; everything after rides the new curve.
    expect(cal[0]).toEqual(uncal[0])
    expect(cal[1].predictedMax).toBeGreaterThanOrEqual(20)
    for (let i = 1; i < 40; i++) {
      expect(cal[i].predictedMax!).toBeGreaterThanOrEqual(uncal[i].predictedMax!)
    }
    expect(cal[39].predictedMax).toBe(100)
  })

  it('leaves sessions up to and including the test untouched', () => {
    const cal = logisticV2.generate(P, [{ sessionIndex: 12, actual: 15 }])
    for (let i = 0; i < 12; i++) expect(cal[i]).toEqual(uncal[i])
  })

  it('snaps the next session to the test result and still ends at targetMax', () => {
    // Predicted at test 12 is ~31; the test came in low at 15.
    const cal = logisticV2.generate(P, [{ sessionIndex: 12, actual: 15 }])
    expect(cal[12].predictedMax).toBeGreaterThanOrEqual(15)
    expect(cal[12].predictedMax).toBeLessThanOrEqual(16)
    expect(cal[39].predictedMax).toBe(100)
  })

  it('does not decay back: the whole future rides the new curve', () => {
    const cal = logisticV2.generate(P, [{ sessionIndex: 12, actual: 15 }])
    // Every future predicted max sits below the uncalibrated curve (which was
    // ~16 reps optimistic at the test) until both converge at the target.
    for (let i = 12; i < 39; i++) {
      expect(cal[i].predictedMax!).toBeLessThanOrEqual(uncal[i].predictedMax!)
    }
  })

  it('holds flat at the result when the test meets or beats targetMax', () => {
    const cal = logisticV2.generate(P, [{ sessionIndex: 12, actual: 120 }])
    for (let i = 12; i < 40; i++) expect(cal[i].predictedMax).toBe(120)
    expect(cal[39].sets[0].target).toBe(120)
  })

  it('keeps the true float in predictedMax; display floors it — 11.9 is still 11', () => {
    const cal = logisticV2.generate(P, [{ sessionIndex: 1, actual: 11.9 }])
    expect(cal[1].predictedMax!).toBeGreaterThanOrEqual(11.9)
    expect(flooredMax(cal[1].predictedMax!)).toBe(11)
  })

  it('builds sets from the true (unfloored) max — flooring is display-only', () => {
    // 11.9 and 11.0 both display as max 11, but the 11.9 anchor must yield
    // more work because the set math rides the true float curve.
    const hi = logisticV2.generate(P, [{ sessionIndex: 1, actual: 11.9 }])
    const lo = logisticV2.generate(P, [{ sessionIndex: 1, actual: 11.0 }])
    expect(flooredMax(hi[1].predictedMax!)).toBe(flooredMax(lo[1].predictedMax!))
    expect(sumTarget(hi[1].sets)).toBeGreaterThan(sumTarget(lo[1].sets))
  })

  it('anchors piecewise: a later test never rewrites the segment before it', () => {
    const one = logisticV2.generate(P, [{ sessionIndex: 12, actual: 15 }])
    const two = logisticV2.generate(P, [
      { sessionIndex: 12, actual: 15 },
      { sessionIndex: 21, actual: 30 },
    ])
    for (let i = 0; i < 21; i++) expect(two[i]).toEqual(one[i])
    expect(two[21].predictedMax).toBeGreaterThanOrEqual(30)
    expect(two[21].predictedMax).toBeLessThanOrEqual(31)
  })
})

describe('logistic-v2 edges', () => {
  it('never emits a set below 1, even for tiny plans', () => {
    const plan = logisticV2.generate(
      { startMax: 1, targetMax: 3, weeks: 2, sessionsPerWeek: 1 },
      [],
    )
    for (const s of plan) for (const set of s.sets) expect(set.target).toBeGreaterThanOrEqual(1)
  })

  it('handles the param-space corners', () => {
    const corners = [
      { startMax: 1, targetMax: 500, weeks: 52, sessionsPerWeek: 7 },
      { startMax: 500, targetMax: 500, weeks: 2, sessionsPerWeek: 1 },
      { startMax: 1, targetMax: 1, weeks: 2, sessionsPerWeek: 1 },
    ]
    for (const params of corners) {
      const plan = logisticV2.generate(params, [])
      expect(plan).toHaveLength(params.weeks * params.sessionsPerWeek + 1)
      for (const s of plan) {
        expect(s.predictedMax).toBeGreaterThanOrEqual(1)
        for (const set of s.sets) expect(set.target).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
