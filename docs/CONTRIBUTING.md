# Contributing

Practical recipes for changing the app. Read
[ARCHITECTURE.md](ARCHITECTURE.md) first — especially "derive, don't mutate";
most mistakes here come from fighting that rule instead of using it.

## Dev loop

```sh
npm install
npm run dev        # hot-reloading dev server
npm test           # vitest — run after any core/ change
npm run build      # type-check + production build (CI runs this too)
```

Ground rules:

- `src/core/` is pure TypeScript: no DOM, no UI imports, everything testable.
  New core behavior gets a test next to it (`*.test.ts`).
- UI components never touch `localStorage` or mutate state directly — they call
  the mutation functions in `store.ts`. If you need a new mutation, add it there.
- Don't store anything that can be derived. If you're about to persist generated
  sessions, dates, or stats: stop, derive them in `derive.ts`/`stats.ts` instead.

Deploys are automatic: push to `main` → GitHub Actions runs the tests → green
builds deploy to Pages. A red test blocks the deploy, so the installed app can't
break from a bad push. Installed PWAs pick the new version up on next launch.

## Adding a training algorithm

Algorithms are `Generator` objects in a registry. The whole change is one new
file plus one list entry — no UI work, no storage work.

**1. Create `src/core/generators/myalgo.ts`:**

```ts
import type { CalibrationPoint, Generator, SessionTemplate } from '../types'

export const myAlgoV1: Generator = {
  id: 'myalgo-v1',            // stable forever — plans store this string
  name: 'My algorithm',
  description: 'One sentence shown in the plan form.',

  // The plan-creation form renders itself from these fields.
  paramFields: [
    { key: 'startMax',        label: 'Current max',    min: 1, max: 500, step: 1, defaultValue: 10 },
    { key: 'weeks',           label: 'Weeks',          min: 2, max: 52,  step: 1, defaultValue: 8 },
    { key: 'sessionsPerWeek', label: 'Sessions/week',  min: 1, max: 7,   step: 1, defaultValue: 3 },
  ],

  // Pure function: same inputs → same output. Called on every render.
  generate(params, calibrations: CalibrationPoint[]): SessionTemplate[] {
    const total = params.weeks * params.sessionsPerWeek
    const sessions: SessionTemplate[] = []
    for (let i = 1; i <= total; i++) {
      sessions.push({
        index: i,                      // 1-based
        type: 'normal',                // or 'test' | 'taper' | 'recovery'
        sets: [{ target: Math.round(params.startMax * (1 + i / total)), isMinimum: false }],
      })
    }
    return sessions
  },
}
```

**2. Register it in `src/core/generators/index.ts`:**

```ts
const generators: Generator[] = [logisticV1, myAlgoV1]
```

Done. The Settings form now offers it in the algorithm picker and renders inputs
for its params.

Contract details:

- `params` **must include `sessionsPerWeek`** — the scheduler reads it to lay
  sessions onto calendar dates.
- Sessions with `type: 'test'` should have a **single set**; when logged, its
  actual value is appended to `plan.calibrations` automatically (`store.ts#logSession`).
  If your algorithm recalibrates, read the `calibrations` argument (see
  `logistic.ts` for the decay approach); if not, ignore it.
- A set with `isMinimum: true` renders as "N+" and prompts for the actual count
  at logging time.
- Every target should be ≥ 1 — clamp, don't trust the math.
- **Never change a shipped generator's output.** Plans store the generator id and
  re-derive their future from it on every render, so editing the math silently
  rewrites the future of every running plan. Behavior change → copy the file,
  bump the id (`myalgo-v2`), register both.

**3. Test it.** Add `myalgo.test.ts` next to it. Minimum bar: expected session
count, targets ≥ 1 across the param space edges (min/max of every field), and —
if it calibrates — a case proving past output is unaffected and future output
bends. `logistic.test.ts` shows the pattern.

## Changing the data schema (migrations)

Stored data outlives code: a phone that hasn't opened the app in months still
holds the old shape in localStorage. `AppData.version` exists for exactly this.

**Additive change** (new *optional* field): no migration needed. Old blobs just
lack the field; make the reading code default it (`plan.notes ?? ''`).

**Breaking change** (rename, restructure, new required field):

1. Change the types in `types.ts`, bump the literal: `version: 2`.
2. Add a one-shot upgrade in `store.ts#load()`, before the shape check:

```ts
function migrate(raw: any): unknown {
  if (raw?.version === 1) {
    raw.plans.forEach((p: any) => { p.note = '' })   // v1 → v2
    raw.version = 2
  }
  // future: if (raw?.version === 2) { ... v2 → v3 }
  return raw
}
```

3. Update `isAppData` to check the new version, and the seed in `seed()`.
4. Test the migration with a real old blob: export a backup *before* your
   change, then assert `migrate(JSON.parse(oldBackup))` passes `isAppData`.

Migrations chain (v1→v2→v3…), so any old device catches up in one load. Never
edit a shipped shape without a bump — `load()` would reject the blob and the
user would silently lose their plan to a fresh seed.

## UI conventions

- Styling is [Basecoat](https://basecoatui.com) — a standalone CSS build of the
  shadcn/ui design system, imported in `src/main.tsx` (via the
  `basecoat-standalone.css` alias in `vite.config.ts`) — plus one app
  stylesheet, `src/index.css`. Reach for Basecoat's pieces first: `class="btn"`
  with `data-variant`/`data-size`, `class="card" data-size="sm"` with a
  `<section>` child, `class="input"`, `class="select"`, `class="badge"`.
  Custom CSS in `index.css` is for layout and app-specific components only,
  and always colors via Basecoat's theme tokens (`--background`, `--card`,
  `--muted`, `--muted-foreground`, `--border`, `--destructive`, `--radius`…)
  so both themes stay correct for free.
- The color theme ("Clay": warm paper/espresso surfaces, terracotta actions)
  is a token override at the top of `index.css` — light values in `:root`,
  dark in `.dark`. Change colors there, never on components; swapping the
  whole theme means swapping those two blocks.
- Dark mode is a `.dark` class on `<html>`, toggled by the inline script in
  `index.html` following `prefers-color-scheme`. Never use
  `@media (prefers-color-scheme)` in CSS — it would disagree with the class.
- Typeface is Geist (variable), self-hosted via `@fontsource-variable/geist`
  so it works offline — imported once in `src/main.tsx`. Tap targets ≥ 44px on
  interactive rows.
- Motion lives in tokens (`--dur-*`, `--ease-out-expo`) plus two shared
  keyframes (`fade-up`, `scale-in`). Reuse those instead of inventing new
  timings, and never animate without the `prefers-reduced-motion` escape hatch
  at the bottom of the stylesheet (it already covers `animation`/`transition`).
- The chart is two-tone: `--viz-planned` maps to `--muted-foreground`,
  `--viz-actual` to `--primary`. Series identity is still carried by shape and
  the legend, so the accent color is never the only signal. The predicted-max
  series is the dotted `.viz-maxline` on its own right-hand scale; it only
  renders when the generator sets `predictedMax` on its sessions.
- Confirmation dialogs (`confirm()`) guard every destructive action (delete
  exercise/plan, import). Keep that — there is no undo.

## Testing philosophy

- `core/` logic is where correctness lives → unit-tested, including golden tests
  that pin `logistic-v1` to the original Swift implementation's output.
- UI is kept thin enough to verify by eye; there are no UI tests. If a component
  starts accumulating logic worth testing, move that logic into `core/`.
