# Architecture

How the app works, top to bottom. Read this before changing anything in `src/core/`.

The app is a **generalized plan engine + logging UI**. Exercise types and training
algorithms are data/config, not code paths: an exercise is a record (name, emoji,
unit), an algorithm is a `Generator` in a registry, and a plan is a reference to a
generator plus its parameters.

## The one rule: derive, don't mutate

Everything else follows from this.

- **Past = facts.** Completing a session writes a `Result` snapshot — the targets
  as they were that day plus what you actually did. History, stats and the chart
  read only Results. Nothing ever regenerates the past. The one edit allowed: for
  24h after finishing (`isResultEditable`, keyed off `Result.completedAt`) you can
  correct the actual counts you logged — a fat-finger fix on the day. Only the
  actuals move; targets, date and set count stay fixed, and a max test's
  calibration point follows the corrected number. After the window closes the
  Result is immutable.
- **Future = pure function.** The schedule you see for incomplete sessions is
  recomputed on every render:

  ```
  sessions = overrides ⊕ generator.generate(plan.params, plan.calibrations)
  dates    = shiftForward(baseDates(plan.startDate, sessionsPerWeek), results, today)
  ```

- **Storage holds only inputs**: params, calibrations, overrides, results. Never
  generated sessions.

Why this matters: plan editing, test recalibration and manual day edits all
*stack*. If generated sessions were stored, every feature that changes the future
would need to reconcile with every other one (regenerate but keep edits? re-apply
calibration after a param change? …). Because the future is always derived from
inputs, there is nothing to reconcile — change an input, the future is simply
recomputed. A plan is ~40 sessions; derivation cost is nil.

Concrete consequences:

| You do | What is stored | What happens on next render |
|---|---|---|
| Log a normal session | one `Result` | session shows as done (from the Result), rest re-derives |
| Check off a single set | `plan.progress` (per-set actuals) | the Today card shows it done; the last set converts progress into a `Result` and clears it |
| Log a max test | a `Result` + a `CalibrationPoint` | future targets bend toward your real max |
| Edit a future day's sets | an override on the plan | that day shows your numbers, survives everything below |
| Edit plan params mid-plan | new `params` | future re-derives from new params; past untouched |
| Skip a few days | nothing | remaining schedule slides forward (computed, not stored) |

## Data model (`src/core/types.ts`)

```
Exercise          name + emoji + unit ('reps' | 'seconds')
Plan              exerciseId + generatorId + params + startDate
                  + status ('active' | 'archived')
                  + calibrations: [{ sessionIndex, actual }]
                  + overrides: { [sessionIndex]: { sets } }
                  + progress?: { sessionIndex, actuals: (number|null)[] }
                    — per-set check-offs of the due session; becomes a
                    Result (and is cleared) when the last set is logged
Result            completion snapshot (actuals editable for 24h, then frozen):
                  planId + sessionIndex + date + sessionType + completedAt
                  + sets: [{ target, isMinimum, actual }]
AppData           { version, exercises[], plans[], results[] } — one localStorage key
```

Invariants:

- At most **one active plan per exercise** (`createPlan` archives any existing
  active one).
- **Stop archives** — its Results keep counting toward stats. **Delete erases**
  the plan *and* its Results.
- `plan.params` is generator-specific, but must contain `sessionsPerWeek` — the
  core scheduler reads it (that's the whole contract between core and generators).
- Sessions are 1-indexed everywhere (`sessionIndex`, `SessionTemplate.index`).

## Module map (`src/core/`)

Everything in `core/` is pure TypeScript with no UI imports; all of it is
unit-tested. Data flows in one direction:

```
store.ts  ──(AppData signal)──►  derive.ts  ──(PlanView)──►  src/ui/*
                                   │
                    ┌──────────────┼────────────────┐
              generators/     schedule.ts       results
              (what to do)    (when to do it)   (what happened)
```

| Module | Responsibility |
|---|---|
| `store.ts` | One `@preact/signals` signal over the whole `AppData` blob; every mutation goes through `update()` which clones, mutates, persists to localStorage. All mutations live here (`createPlan`, `completeSession`, `logSet`, `setOverride`, …) — UI components never touch storage directly. |
| `derive.ts` | `derivePlanView(plan, results, today)` — merges generator output, overrides, results and shifted dates into `SessionView[]` plus `due` / `next` / `endDate`. The single source for "what does this plan look like right now". |
| `schedule.ts` | `baseDates` spreads sessions evenly per week from the start date (3/wk → offsets 0, 2, 4). `shiftedDates` slides the remaining schedule forward when the first incomplete session is overdue. The single place a smarter rescheduler would plug in. |
| `generators/` | The algorithm registry. See below. |
| `stats.ts` | Streak (sessions ≤ 7 days apart, ending within 7 days of today) and lifetime totals, computed across active *and* archived plans of an exercise. |
| `dates.ts` | ISO-date arithmetic done at UTC noon so DST transitions can't skew day math. |

Session state machine (in `derive.ts`): a session is `done` (has a Result),
`due` (the **first** incomplete session, date ≤ today — logging is strictly
sequential, so at most one session is ever due), or `upcoming`.

## Generators (`src/core/generators/`)

```ts
interface Generator {
  id: string            // stable forever — stored in every plan that uses it
  name: string
  description: string
  paramFields: ParamField[]   // declarative → the plan form renders itself
  generate(params, calibrations): SessionTemplate[]   // pure, idempotent
}
```

- `paramFields` is a declarative schema (`key`, `label`, `min`, `max`, `step`,
  `defaultValue`). The Settings form renders inputs from it — a new generator
  needs **zero UI code**.
- `generate` must be a pure function: same inputs → same output. It is called on
  every render.
- Generators that don't support recalibration simply ignore the `calibrations`
  argument.
- **Generator ids are stable forever.** Plans store the id; changing an existing
  generator's math silently changes the future of every running plan that uses
  it. Behavior change → new id (`logistic-v2`), old one stays.

How to add one: [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-training-algorithm).

### `logistic-v1` — the ported example

Port of the algorithm from the original iOS app ("100 Pushups in 13 Weeks"),
generalized from its fixed 13-weeks-×-3 shape to any `weeks × sessionsPerWeek`:

- **Theoretical max curve**: flat for 3 lag sessions, then a logistic S-curve from
  `startMax` to `targetMax`. Steepness scales with plan length (k = 0.25 at the
  original 13w×3 shape, so that shape reproduces the original exactly).
- **Sessions**: 3 fixed sets + a minimum-then-as-many-as-you-can 4th set;
  rotating volume / mixed / intensity day templates; a difficulty multiplier
  easing from 1.25 (max ≤ 10) to 0.75 (max ≥ 100).
- **Max tests** at the end of every 3rd week (from week 4, while ≥ 3 weeks
  remain) plus a final test; taper session before, recovery session after.
- **Calibration**: after a test, future maxes shift by (actual − predicted),
  decaying linearly to zero by the last session. Only the latest test counts.
  (One deliberate deviation from the Swift original: the decay clamps at 0
  instead of briefly going negative on the final session.)

`logistic.test.ts` golden-tests it against a direct transliteration of the Swift
original — bit-identical output for the 13w×3 shape.

### `logistic-v2` — the default

Moderate-volume successor (v1 prescribed 105–239% of the predicted max per
session with single sets up to 105% — too much, too hard). Same test cadence
and taper (×0.6) / recovery (×0.85) structure; what changed:

- **The plan opens with a max test** (session 1, predicted = `startMax`):
  measure the real max first, then train from it — logging it re-anchors the
  curve immediately. A recovery session follows, as after any other test.
- **Every session derives from that day's predicted max** and totals ~140–160%
  of it across 4 sets. The difficulty multiplier is gone.
- **One heavier day per week** (first session): top set capped at 85% of
  predicted max (floor-rounded so the cap holds), the rest easy. Other days are
  ~4 × 40% with a slight wave, alternating two patterns. Taper/recovery days
  always use the easy shape.
- **No AMRAP outside tests** — every non-test set is a fixed target.
- **Curve**: a **Gompertz** sigmoid (not a symmetric logistic), normalized to
  pass exactly through `startMax` (session 1) and `targetMax` (final test).
  Rationale: training gains are asymmetric — fast early (neural adaptation,
  form efficiency), then a long diminishing-returns grind toward the ceiling.
  Gompertz puts the inflection at ~35% of the span; a symmetric logistic would
  claim the biggest weekly jumps mid-plan, where there's no mechanism for them.
  (The generator id stays `logistic-v2` — ids are opaque and stable.)
- **Calibration re-anchors from the test day onward**: the test's own day snaps
  to the measured result, and the future is a fresh Gompertz from that result to
  `targetMax` over the remaining sessions — no decay back. It never rewrites the
  past: sessions strictly before the test keep the curve they were generated
  from (anchoring is piecewise per test). So a 54-rep test never leaves that day
  still predicting 60. A result at or above `targetMax` holds the curve flat there.
  The early inflection composes well with this: each re-anchored segment pushes
  in the fresh weeks right after a test + recovery and eases as the next test
  approaches — a built-in mini-taper.
- Every session carries **`predictedMax`**, which the UI prints on schedule and
  history rows and plots as the dotted right-axis line in the chart.

`store.ts` migrates *active* `logistic-v1` plans to `logistic-v2` on load
(archived plans keep v1 so their history derives exactly as generated).

## UI (`src/ui/`)

Thin Preact components over the derived views. No component owns data — they read
`db.value` (or props derived from it) and call `store.ts` mutations. The signal
update re-renders everything; at this data size that's the simplest correct model.

| File | Screen area |
|---|---|
| `App.tsx` | Tab bar (one tab per exercise; Settings sits behind a fixed gear button top-right, not in the bar), `useToday()` (re-renders on foregrounding / every minute so "today" survives midnight) |
| `ExerciseTab.tsx` | Composition: today card → stats → chart → schedule → history |
| `TodayCard.tsx` | Per-set logging: tap a set when you've done it (tap again to undo); the last set completes the session. Max tests and minimum sets prompt for actual numbers; one button logs everything remaining; "Adjust reps" edits today's targets as an override *without* logging the session |
| `ScheduleList.tsx` | Upcoming sessions; tapping a row opens an inline editor that stores an override |
| `HistoryList.tsx` | Past Results, newest first; rows finished within 24h are tappable to correct the logged actuals |
| `Chart.tsx` | SVG progress chart — planned volume line, done dots, test diamonds, tap/drag crosshair. Colors are `--viz-*` tokens validated for both themes |
| `Settings.tsx` | Exercise CRUD, plan lifecycle (create / edit params / stop / delete), self-rendering param forms, JSON backup |

Styling: one `src/index.css`, design tokens (colors, radii) as CSS custom
properties at the top, automatic dark mode via `prefers-color-scheme`.

## PWA / persistence

- `vite-plugin-pwa` (Workbox) precaches the build; `registerType: 'autoUpdate'`
  means an installed app fetches new deploys on next launch, no user action.
- All data sits in **one localStorage key** (`training-pwa`) as versioned
  `AppData`. `store.ts#load()` falls back to seed data if the blob is missing or
  malformed. Schema changes require a version bump + migration — recipe in
  [CONTRIBUTING.md](CONTRIBUTING.md#changing-the-data-schema-migrations).
- GitHub Pages serves the app under `/<repo>/`; the workflow sets `BASE_PATH`
  and `vite.config.ts` uses it as `base`.
