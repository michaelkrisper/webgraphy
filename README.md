# Webgraphy

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](https://michaelkrisper.github.io/webgraphy/)
[![Deploy](https://github.com/michaelkrisper/webgraphy/actions/workflows/deploy.yml/badge.svg)](https://github.com/michaelkrisper/webgraphy/actions/workflows/deploy.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A precision-focused, high-performance data visualization application that handles datasets with millions of points while keeping interaction smooth. Webgraphy uses custom WebGL shaders and off-main-thread processing to render and explore data at scale, directly in the browser.

**Live demo:** <https://michaelkrisper.github.io/webgraphy/>

## Highlights

- **Millions of points, fluid interaction.** Custom WebGL shaders draw raw data with high-precision relative offsets (`refPoint`) to avoid floating-point artifacts at large coordinate values.
- **Background data processing.** Import, parse, and formula evaluation run in Web Workers, so the UI stays responsive on multi-GB files.
- **Rich interaction model.** Pan/zoom per axis, `Ctrl + Drag` box zoom, smart Y-axis zero-line snapping, a data-snapping crosshair, and double-click auto-scaling.
- **Multi-axis charts.** Up to 9 independent X and Y axes, per-axis position and color, numeric or date/time X-axis modes.
- **Formula engine.** Add calculated columns with math, trigonometry, rolling/time/group averages, Kalman filtering, and regression fits (linear, polynomial, exponential, logistic, KDE).
- **PWA & offline.** Installable Progressive Web App with auto-update; opens previously imported data instantly via IndexedDB.
- **Robust persistence.** Datasets live in IndexedDB; UI state, series configuration, and theme in LocalStorage — all restored on next visit.
- **High-quality export.** SVG and PNG export of the current view, theme-aware.

## Supported Inputs

Drag-and-drop or pick a file: **CSV**, **JSON**, **XLSX / XLS** (with sheet selection). Large files are streamed to a worker; skipped rows are reported in a preview panel.

## Quick Start

Webgraphy uses **pnpm** and requires **Node.js ≥ 24**.

```bash
pnpm install
pnpm run dev      # start the dev server (http://localhost:5173)
pnpm run build    # type-check and produce a production build in dist/
pnpm run preview  # serve the production build locally
pnpm run lint     # run ESLint
pnpm run test     # run the Vitest suite
```

## Deployment

Pushes to `master` are automatically built and published to GitHub Pages by the workflow in `.github/workflows/deploy.yml`. The production site is served from `https://michaelkrisper.github.io/webgraphy/`.

## Interaction Reference

### Plot area
| Action | Effect |
| --- | --- |
| Mouse wheel | Zoom both axes |
| Drag | Pan |
| Shift + drag/wheel/keys | Synchronize all X-axes |
| Ctrl + drag | Box zoom into a region |
| Hover | Snap crosshair + tooltip to nearest point |
| Ctrl + C | Copy tooltip values to clipboard |
| Double-click | Auto-scale to fit |
| Drop file | Import CSV / JSON / XLSX |

### Axes (X & Y)
| Action | Effect |
| --- | --- |
| Wheel on axis | Zoom only that axis |
| Drag on axis | Pan only that axis |
| Double-click on axis | Auto-scale that axis |
| Ctrl + double-click (Y) | Auto-scale to upper or lower half (based on click position) |
| Click on title | Rename the axis |

### Keyboard
| Key | Effect |
| --- | --- |
| ← → | Pan X axis (animated) |
| ↑ ↓ | Pan Y axis (hovered, or all) |
| `+` / `=` | Zoom in |
| `-` / `_` | Zoom out |
| Shift + ← → | Pan all X-axes together |
| Ctrl + `+` / `-` | Zoom only the X axis |

## Formula Engine

Reference other columns with `[Column Name]`. Math operators: `+ - * / ^` with parentheses. Constants `pi`, `e`.

| Function | Purpose |
| --- | --- |
| `sqrt`, `abs`, `exp`, `log` (base 10), `ln`, `round`, `floor`, `ceil` | Math basics |
| `sin`, `cos`, `tan`, `asin`, `acos`, `atan` | Trigonometry (radians) |
| `min(...)`, `max(...)`, `sum(...)`, `avg(...)` | Aggregations (no args = across all numeric columns in the row) |
| `avgN([col])` | Rolling average over N rows. Suffix: `avgNc` central (default), `avgNl` left/trailing, `avgNr` right/leading |
| `avgNs / avgNm / avgNh / avgNd([col])` | Rolling average over N seconds/minutes/hours/days, with the same `c`/`l`/`r` alignment suffix |
| `avgDay`, `avgHour`, `avgMinute`, `avgSecond([col])` | Per-bucket cumulative average (resets per calendar bucket) |
| `sumDay`, `sumHour`, `sumMinute`, `sumSecond([col])` | Per-bucket cumulative sum |
| `filter([col])` | Adaptive Kalman filter (noise smoothing) |
| `linreg([col])` | Linear regression fit |
| `polyreg([col], degree)` | Polynomial regression (default degree 3) |
| `expreg([col])` | Exponential regression fit |
| `logreg([col])` | Logistic regression fit |
| `kde([col])` or `kde([col], bandwidth)` | KDE-smoothed fit |

## Architecture

- **Frontend:** React 19 + TypeScript, bundled with Vite 8.
- **Rendering:** Raw WebGL with custom precision shaders. Per-frame updates bypass the React render cycle and the global store for responsiveness.
- **State:** [Zustand](https://github.com/pmndrs/zustand) stores in `src/store/`.
- **Persistence:** [`idb`](https://github.com/jakearchibald/idb) for datasets (IndexedDB); LocalStorage for UI config and theme.
- **Concurrency:** Parsing (CSV/JSON/Excel) and formula evaluation run in Web Workers (`src/workers/`).
- **PWA:** Service worker via `vite-plugin-pwa` (auto-update).

### Key directories

```
src/
├── components/Plot/      # WebGL renderer, chart container, interactions
├── components/Layout/    # Sidebar, modals, header/footer
├── components/Sidebar/   # Data sources, series, color picker
├── store/                # Zustand stores
├── services/             # Persistence, export (SVG/PNG)
├── utils/                # Data parser, formula engine, coordinate math
├── workers/              # CSV/JSON parsing, formula workers
└── themes.ts             # Light, Dark, Matrix, Winnie, Unicorn
```

## Contributing

This project uses `pnpm`. When you modify `package.json` (dependencies, overrides), run `pnpm install` and commit the updated `pnpm-lock.yaml` alongside it. Run `pnpm run lint` and `pnpm run test` before opening a pull request.

## License

[MIT](LICENSE) © Michael Krisper
