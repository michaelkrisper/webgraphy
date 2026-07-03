# Webgraphy — Agent Notes

High-performance, precision-focused data visualization. Custom WebGL renderer,
worker-based ingestion, IndexedDB persistence. Designed for datasets in the
millions of points.

## Stack

- **Frontend:** React 19, TypeScript, Vite 8 (Node ≥ 24, pnpm).
- **Rendering:** Raw WebGL2 with custom precision shaders; series lines are
  instanced triangle capsules (AA, real widths, dashes). The renderer core
  runs in a render worker via OffscreenCanvas when available. Per-frame
  updates bypass React and Zustand for responsiveness.
- **State:** Zustand (`src/store/`) for series, viewport, axes, themes.
- **Persistence:** `idb` for datasets, LocalStorage for UI state and config.
- **Concurrency:** Web Workers (`src/workers/`) for CSV/JSON parsing,
  formula evaluation, and rendering (`render.worker.ts`).
- **PWA:** `vite-plugin-pwa` (auto-update, installable).

## Data Flow

1. `useDataImport` accepts CSV / JSON / XLSX (sheet selection for Excel).
2. `src/utils/data-parser.ts` parses and computes bounds; values are stored as
   relative offsets to a `refPoint` to keep WebGL coords inside f32 precision.
3. Processed datasets land in IndexedDB; series and viewport config in
   LocalStorage.
4. `useGraphStore` (Zustand) is the single source of truth for active datasets
   and series configuration.
5. `WebGLRenderer` (React host) resolves datasets + series configs and hands
   them to `rendererCore.ts`, which draws via custom shaders — inside
   `render.worker.ts` (OffscreenCanvas) or on the main thread as fallback.
   Pan/zoom mutate the viewport directly and re-render without going through
   React.

## Key Directories

- `src/components/Plot/` — `WebGLRenderer`, `ChartContainer`, crosshair,
  legend, axis interactions.
- `src/components/Layout/` — Sidebar shell, modals (Help, Calculated Column,
  Import Settings, Export).
- `src/components/Sidebar/` — Data sources, series config, color picker.
- `src/store/` — Zustand stores.
- `src/services/` — Persistence (`idb`), export (SVG + PNG).
- `src/utils/` — Data parser, formula compiler/evaluator, coordinate math.
- `src/workers/` — Off-main-thread parsing and formula workers.

## Scripts

```bash
pnpm install
pnpm run dev       # Vite dev server
pnpm run build     # tsc -b && vite build
pnpm run preview   # serve dist/
pnpm run lint      # ESLint
pnpm run test      # Vitest
```

Deployment is automatic via `.github/workflows/deploy.yml` on push to `master`.

## Conventions

- **Performance first.** WebGL is the only data-rendering path. Avoid
  full-store updates on per-frame interactions.
- **Precision.** Use `refPoint` offsets in shaders; never feed raw absolute
  timestamps or large coords directly into f32 attributes.
- **Type safety.** Strict TypeScript; no `any` unless unavoidable at FFI
  boundaries.
- **Persistence awareness.** Any `GraphState` change that should survive a
  refresh must flow through the `persistence` service.
- **Package manager.** Use `pnpm`. After any `package.json` change (deps,
  overrides) run `pnpm install` and commit `pnpm-lock.yaml`.

## Formula Engine (`src/utils/formula.ts`)

Reference columns as `[Column Name]`. Operators `+ - * / ^`; constants `pi`,
`e`.

- Math: `sqrt`, `abs`, `exp`, `log` (base 10), `ln`, `round`, `floor`, `ceil`.
- Trig: `sin`, `cos`, `tan`, `asin`, `acos`, `atan` (radians).
- Aggregations: `min`, `max`, `sum`, `avg` (no args ⇒ across all numeric
  columns in the row).
- Rolling: `avgN` over rows; `avgNs|m|h|d` over time windows. Alignment
  suffix `c` (central, default) / `l` / `r`.
- Time-bucketed cumulative: `avgDay`, `avgHour`, `avgMinute`, `avgSecond` and
  the `sum…` variants.
- Smoothing: `filter` (adaptive Kalman).
- Regression fits: `linreg`, `polyreg([col], degree)`, `expreg`, `logreg`,
  `kde([col], bandwidth?)`.
