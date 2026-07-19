import { describe, expect, it } from 'vitest'
import { logisticV1 } from './logistic'
import { logisticV2 } from './logistic2'

const P = { startMax: 10, targetMax: 100, weeks: 13, sessionsPerWeek: 3 }

describe('logistic-v2 layout', () => {
  const plan = logisticV2.generate(P, [])

  it('keeps the v1 session-type layout (tests, tapers, recoveries)', () => {
    const v1 = logisticV1.generate(P, [])
    expect(plan.map((s) => s.type)).toEqual(v1.map((s) => s.type))
    expect(plan).toHaveLength(40)
  })

  it('tests are a single set at the predicted max', () => {
    for (const s of plan.filter((x) => x.type === 'test')) {
      expect(s.sets).toEqual([{ target: s.predictedMax, isMinimum: false }])
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

  it('normal sessions land at ~140-160% of predicted max (rounding slack)', () => {
    for (const s of plan) {
      if (s.type !== 'normal' || s.predictedMax! < 25) continue
      const vol = s.sets.reduce((sum, x) => sum + x.target, 0)
      const ratio = vol / s.predictedMax!
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

  it('first session of the week is the heavy day; other days are the two easy waves', () => {
    // Session 1: max 10 → heavy 20/85/20/20% → 2/8/2/2 (85% floor-rounded).
    expect(plan[0].sets.map((s) => s.target)).toEqual([2, 8, 2, 2])
    // Sessions 2 and 3 follow easy patterns A and B of their own predicted max.
    const easyA = [0.4, 0.45, 0.4, 0.35]
    const easyB = [0.35, 0.4, 0.45, 0.35]
    expect(plan[1].sets.map((s) => s.target)).toEqual(
      easyA.map((f) => Math.max(1, Math.round(f * plan[1].predictedMax!))),
    )
    expect(plan[2].sets.map((s) => s.target)).toEqual(
      easyB.map((f) => Math.max(1, Math.round(f * plan[2].predictedMax!))),
    )
  })

  it('heavy day at a clean max is exact: 100 → 20/85/20/20', () => {
    const big = logisticV2.generate({ ...P, startMax: 100, targetMax: 200 }, [])
    expect(big[0].sets.map((s) => s.target)).toEqual([20, 85, 20, 20])
  })

  it('taper and recovery days scale the easy shape down and never go heavy', () => {
    const v1types = plan.map((s) => s.type)
    for (const s of plan) {
      if (s.type !== 'taper' && s.type !== 'recovery') continue
      const reduction = s.type === 'taper' ? 0.6 : 0.85
      const expected = [0.4, 0.45, 0.4, 0.35].map((f) =>
        Math.max(1, Math.round(f * s.predictedMax! * reduction)),
      )
      expect(s.sets.map((x) => x.target), `session ${s.index}`).toEqual(expected)
    }
    expect(v1types.filter((t) => t === 'taper').length).toBeGreaterThan(0)
  })
})

describe('logistic-v2 calibration (re-anchor)', () => {
  const uncal = logisticV2.generate(P, [])

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
