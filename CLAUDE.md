# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WebGraphy — client-only PWA for high-performance data visualization with WebGL. React 19 + TypeScript + Vite. No backend; all data lives in the browser (IndexedDB). Deployed to GitHub Pages from `master`.

## Commands

Package manager is **npm** (ships with Node >=24). CI runs `npm ci`; locally use `npm install`.

- `npm run dev` — Vite dev server.
- `npm run build` — `tsc -b && vite build` (type-check then bundle).
- `npm run lint` — ESLint over the repo.
- `npm test` — Vitest run (one-shot).
- `npx vitest run --coverage` — tests with coverage thresholds enforced (what CI runs). Thresholds live in `vitest.config.ts`; the build fails if coverage drops below them. Ratchet up, never down.
- Single test file: `npx vitest run src/utils/__tests__/formula.test.ts`
- Single test by name: `npx vitest run -t "name substring"`
- Watch: `npx vitest`

`@` is aliased to `./src` (see `vitest.config.ts`). Tests run in jsdom; `src/__tests__/setup.ts` mocks `localStorage`.

CI (`.github/workflows/ci.yml`): lint → coverage test → build, then deploy `dist` to Pages on `master`. All four gates must pass.

## Architecture

### Data flow
File import → **parser web worker** (`src/workers/parser.worker.ts` → `utils/data-parser.ts`) → `ParsedDataset` with columns as **`Float32Array`** → store `addDataset` resolves the x-axis column + axis slot → IndexedDB. Calculated columns go through the **formula web worker** (`workers/formula.worker.ts` → `utils/formula.ts`). Workers transfer `ArrayBuffer`s (zero-copy); never assume a buffer is still usable after posting.

### State — `src/store/useGraphStore.ts` (Zustand)
Single store holding `datasets`, `series`, `xAxes`, `yAxes`, plus UI flags. Key model facts:
- There are always **9 fixed x-axis and 9 fixed y-axis slots** (`axis-1`..`axis-9`), created up front. Adding data assigns a dataset to a free x-axis slot; it does not create axes.
- A **`SeriesConfig`** binds a dataset column (`sourceId` + `yColumn`) to a `yAxisId`. A **`Dataset`** owns one `xAxisColumn`/`xAxisId`.
- Persistence is **split and debounced**: `saveViewport` (axis min/max, 250ms), `saveConfig` (series + titles + toggles, 150ms), and per-dataset `saveDataset`. Writes are gated on `isLoaded` and scheduled via `requestIdleCallback`. When adding store actions that mutate data, follow the existing pattern of calling the matching debounced saver.
- On startup `loadPersistedState` restores from IndexedDB, else loads demo data (`services/demoData.ts`).

### Persistence — `src/services/persistence.ts`
IndexedDB (via `idb`), DB `webgraphy-db` v2: a `datasets` store (large typed-array payloads) and an `app_state` store (viewport + config under separate keys). All loaded state is validated with **Zod** schemas before entering the store — keep schemas in sync when changing the `Dataset`/`*Config` interfaces (also exported from this file).

### Rendering — `src/components/Plot/`
The hot path. `ChartContainer.tsx` orchestrates; it does **not** re-render per frame.
- `rendererCore.ts` is the framework-free **WebGL2** renderer: two GLSL ES 3.00 programs (instanced triangle-capsule series lines; point sprites + screen-space overlay), `GLStateCache.ts` (uniform/attrib/divisor caching across both programs), M4 pixel-budget decimation. It runs inside `workers/render.worker.ts` via `OffscreenCanvas` when supported, else on the main thread — `renderBackend.ts` picks the backend (StrictMode-safe: a canvas can only be transferred once) and `WebGLRenderer.tsx` is the thin React host that resolves store data into plain renderer inputs.
- Series lines are never drawn with native `gl.LINES`/`LINE_STRIP` (driver line width caps at 1px on ANGLE/D3D and core profiles). Each segment is an instanced quad expanded in the vertex shader from `gl_VertexID` + per-instance endpoints read straight from the column buffers (4-byte stride/offset trick), shaded with a capsule SDF for AA, real widths, round joins, and dashes. Only 1px overlay primitives (grid/spines/ticks) still use native LINES.
- The worker backend mirrors only the columns of live series (keyed by `Float32Array` identity, pruned symmetrically) — never assume the worker has data the last `series` message didn't reference.
- `AxesLayer.tsx` draws axis labels/ticks on a 2D canvas.
- Pan/zoom and keyboard nav mutate **target ref objects** (`targetXAxes`/`targetYs`), and a `requestAnimationFrame` `syncViewport` loop interpolates → redraws WebGL + axes imperatively, only writing back to the Zustand store when interaction settles. This ref+rAF indirection is deliberate: do not "simplify" it into render-driven state, and avoid adding store subscriptions or React state on the per-frame path.
- Layout math is extracted into pure, individually-tested modules (`computeAxesLayout`, `buildXAxisLayout`, `axisGutters`, `seriesPrep`, `drawSeries`, `pixelBudget`, etc.). Prefer adding/adjusting these pure functions over inlining logic into components.

### Formula engine — `src/utils/formula.ts`
text → lexer → shunting-yard RPN → row-wise interpreter over a pre-allocated stack. **No `eval`/`new Function`**; column refs and function names are validated against the dataset and `formulaFunctions.ts` (the single source of truth for functions — add new functions there). Regression/group-average formulas (`linreg`, `polyreg`, `kde`, etc.) take a separate full-column path and can emit a compact sparse sub-dataset.

## Conventions

- Tests are colocated in `__tests__/` next to the code (also some `*.test.ts` beside source). Pure logic is unit-tested directly; components use Testing Library.
- Numeric column data is `Float32Array`; dates/large numbers use a `refPoint` offset (`isFloat64`) to preserve precision — respect this when reading/writing column data.
- ESLint flat config (`eslint.config.js`) includes `react-hooks` and `react-refresh` rules; the codebase is lint-clean and CI enforces it.
