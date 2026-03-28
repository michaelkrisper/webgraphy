# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # TypeScript type check + Vite bundle (outputs to /dist)
npm run lint       # ESLint (strict mode)
npm run preview    # Preview production build
```

No test framework is configured.

## Architecture Overview

**Webgraphy** is a browser-based data visualization tool — users import CSV/JSON files, configure multi-series plots with independent Y-axes, and interact via pan/zoom on a WebGL canvas.

### Data Flow

```
CSV/JSON file → Web Worker (data-parser.worker.ts) → Float32Array columns
    → IndexedDB (datasets) + localStorage (UI state)
    → Zustand store (useGraphStore.ts)
    → WebGLRenderer.tsx (custom GLSL shaders)
```

- Data columns are stored as `Float32Array` throughout — memory-efficient and directly usable by WebGL
- Web Worker (`src/workers/data-parser.worker.ts`) parses files off the main thread using transferable objects
- IndexedDB (via `idb`) stores datasets; `localStorage` stores serialized app state (series, axes, viewport)
- On app mount (`App.tsx`), persisted state is rehydrated into the Zustand store

### State Management

Single Zustand store in `src/store/useGraphStore.ts` holds:
- `datasets` — imported data with column arrays
- `series` — X/Y column references, styling, Y-axis assignment
- `yAxes` — independent axes with custom min/max, position (left/right), color, gridlines
- `viewport` — current pan/zoom state
- Auto-saves to `src/services/persistence.ts` on change

### Rendering

`WebGLRenderer.tsx` uses custom GLSL shaders for anti-aliased line segments (segment-based geometry extrusion) and circle points. Coordinate math lives in `src/utils/coords.ts` (world↔screen transforms).

`src/utils/lttb.ts` implements Largest-Triangle-Three-Buckets downsampling used both in rendering and SVG/PNG export (`src/services/export.ts`).

### Key Patterns

- **Auto-cleanup**: deleting a series removes orphaned Y-axes from the store
- **Column addressing**: series reference columns by dataset ID + column name string
- `PlotArea.tsx` owns pan/zoom event handling and passes viewport state down to `WebGLRenderer`
- Sidebar is split: `Layout/Sidebar.tsx` handles file import/export/dataset list; `Sidebar/SeriesConfig.tsx` handles per-series styling
