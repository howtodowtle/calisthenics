# Training

A personal progressive-training PWA: push-ups, pull-ups, and any other rep- or
seconds-based exercise. Pick a goal ("I can do 10 push-ups, I want 100 in 13 weeks"),
get a full session-by-session schedule, log each workout with one tap. Max-test days
recalibrate the plan to your real progress.

- **Offline-first PWA** — installs to the iPhone home screen from Safari, works in
  airplane mode.
- **Local-only** — all data lives in `localStorage` on the device. No backend, no
  account, no sync.
- **A plan engine, not a push-up app** — exercises and training algorithms are data,
  not code paths. New algorithm = one file. See
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

[Vite](https://vitejs.dev) + TypeScript + [Preact](https://preactjs.com) +
[@preact/signals](https://preactjs.com/guide/v10/signals/), styled with
[Basecoat](https://basecoatui.com) — a standalone CSS build of the
[shadcn/ui](https://ui.shadcn.com) design system (no React, no Tailwind
toolchain) — plus one small app stylesheet. The
[Geist](https://vercel.com/font) typeface is self-hosted for offline use.
[vite-plugin-pwa](https://vite-pwa-org.netlify.app) for the service worker,
[Vitest](https://vitest.dev) for tests. No state library, no backend.
Production bundle gzips to ~16 kB of JS + ~25 kB of CSS, plus ~30 kB of font.

## Develop

```sh
npm install
npm run dev        # dev server with hot reload
npm test           # unit tests (generator parity, scheduler, derivation)
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
```

Icons: `sh scripts/make-icons.sh` (requires ImageMagick).

## Repo map

```
src/core/            everything that isn't UI — pure TypeScript, fully unit-tested
  types.ts           the data model (start here)
  store.ts           localStorage persistence + all mutations
  derive.ts          turns stored inputs into the displayed schedule
  schedule.ts        session dates + shift-forward on skipped days
  stats.ts           streak / totals
  dates.ts           date arithmetic (DST-safe)
  generators/        training algorithms (registry + one file per algorithm)
src/ui/              Preact components, one file per screen area
src/index.css        app styling on top of Basecoat (shadcn design system)
docs/                architecture + contributing guides
.github/workflows/   test + deploy pipeline
```

## Documentation

| Doc | What it answers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app works: data model, derive-don't-mutate, calibration, scheduling |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to change it: add an algorithm, migrate the schema, UI conventions, deploy |

## Deploy (GitHub Pages)

One-time setup:

1. Create a GitHub repo and push this project to `main`.
2. Repo → Settings → Pages → Source: **GitHub Actions**.

Every push to `main` then runs `npm test` and, if green, builds and deploys via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). The app lands at
`https://<user>.github.io/<repo>/`. Installed apps pick up new versions
automatically on next launch (service-worker auto-update).

## Install on iPhone

1. Open the deployed URL in **Safari**.
2. Share → **Add to Home Screen**.
3. Launch from the icon — it runs standalone and offline.

## Data & backup

Everything lives in `localStorage` on the device. iOS can evict web-app storage
after weeks of disuse — export a backup from Settings once in a while (JSON file,
re-importable on any device).
