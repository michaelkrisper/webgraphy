# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # TypeScript type check + Vite bundle (outputs to /dist)
npm run lint       # ESLint (strict mode)
npm run preview    # Preview production build
npm run test       # Run Vitest unit tests (jsdom environment)
```

Run a single test file: `npx vitest run src/utils/__tests__/lttb.test.ts`

`npm run build` runs `tsc -b` before bundling — fix all TypeScript errors before shipping.

## Architecture Overview

**Webgraphy** is a browser-based data visualization tool — users import CSV/JSON files, configure multi-series plots with up to 9 independent X- and Y-axes, and interact via pan/zoom on a WebGL canvas.

### Data Flow

```
CSV/JSON file → data-parser.worker.ts (Web Worker, transferable Float32Arrays)
    → IndexedDB (datasets via idb) + localStorage (axes/series/UI state)
    → Zustand store (useGraphStore.ts)
    → ChartContainer.tsx (layout, ticks, interaction)
    → WebGLRenderer.tsx (custom GLSL shaders)
```

- **Float32Array throughout** — columns stored as relative values (`value - refPoint`) with pre-computed `chunkMin`/`chunkMax` arrays (512-point chunks) for fast range queries
- **Transferable objects** — worker ships parsed data to main thread zero-copy
- On app mount, `loadPersistedState()` rehydrates from IndexedDB/localStorage; falls back to demo weather dataset

### State Management (`src/store/useGraphStore.ts`)

Single Zustand store:
- `datasets` — imported data; each `DataColumn` holds `Float32Array data`, `refPoint`, `bounds`, `chunkMin`/`chunkMax`
- `series` — X/Y column references (by dataset ID + column name), styling, axis assignment
- `xAxes` / `yAxes` — up to 9 each, with custom min/max, position (left/right for Y), color, gridlines
- `views` — saved zoom/pan snapshots

Auto-save: state changes trigger a 1 000 ms debounced `debouncedSaveState()` → IndexedDB + localStorage.

**Auto-cleanup rule:** deleting a series removes any Y-axis that no longer has series referencing it.

### Rendering (`src/components/Plot/`)

`ChartContainer.tsx` (≈940 lines) owns all interaction: pan/zoom via mouse/touch, Ctrl+Drag box-zoom, crosshair snapping, tick generation, and multi-axis layout (cumulative offset calculation for stacked left/right Y-axes). It renders SVG grid/axes/labels and delegates line drawing to `WebGLRenderer`.

`WebGLRenderer.tsx` — custom GLSL shaders:
- Vertex: segment-based geometry extrusion (not polyline) for correct line width
- Fragment: distance-field antialiasing; supports solid/dashed/dotted lines and circle/square/cross point markers
- Uniforms `u_rel_viewport_x`/`u_rel_viewport_y` receive the current pan/zoom viewport; coordinate math in `src/utils/coords.ts`

`src/utils/lttb.ts` — Largest-Triangle-Three-Buckets downsampling; used in both the renderer (when point count exceeds threshold) and SVG/PNG export (`src/services/export.ts`).

### Formula & Regression System

`src/utils/formula.ts` — safe expression compiler (Shunting-yard, no `eval`). Column references use `[Column Name]` syntax. Supports standard math functions plus `avgN()`, `avgTime()`, `avgGroup()`, `filter()` (Kalman).

`src/workers/formula.worker.ts` — evaluates compiled formulas and runs regression fits off-thread: `linreg`, `polyreg`, `expreg`, `logreg`, `kde`. Results come back as Float64Array → converted to Float32Array on the main thread.

### Persistence (`src/services/persistence.ts`)

- **IndexedDB** (`webgraphy-db` v2): stores `datasets` and `app_state` objects
- **localStorage**: `legendVisible`, `theme`, `webgraphy-cleared` (first-run flag)
- `src/services/session.ts` handles full session serialization (export/import as JSON file)

### Theme System (`src/themes.ts`)

Four themes: `light`, `dark`, `matrix`, `unicorn`. Each defines ~40 CSS variables (chart colors, UI chrome, tooltip). Applied via `useTheme()` hook → written to document CSS variables + persisted in localStorage.

### Key Conventions

- **Column addressing** — series reference data by `{ datasetId, columnName }` strings, not numeric indices; use `src/utils/columns.ts` helpers to resolve them
- **Coordinate math** — always go through `src/utils/coords.ts` (`worldToScreen` / `screenToWorld`); don't inline viewport math
- **Viewport animation** — use `animateXAxes()` / `animateYAxes()` from `src/utils/animation.ts` for smooth transitions instead of direct state writes
- **Sidebar split** — `src/components/Layout/Sidebar.tsx` handles file import/export/dataset list; `src/components/Sidebar/SeriesConfig.tsx` handles per-series styling
- **Workers** — heavy parsing and formula evaluation must stay in workers; never block the main thread with large array iteration
- **TypeScript strict** — `noUnusedLocals` and `noUnusedParameters` are enabled; clean up all unused symbols

### Deployment

GitHub Actions (`.github/workflows/deploy.yml`) runs `npm run build` on push to `master` and deploys `/dist` to GitHub Pages. The Vite config uses `base: './'` for relative asset paths.
