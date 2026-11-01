# WebGraphy

[![Live](https://img.shields.io/badge/Live-app-brightgreen)](https://michaelkrisper.github.io/webgraphy/)
[![CI](https://github.com/michaelkrisper/webgraphy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/michaelkrisper/webgraphy/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A desktop-first data plotting app that runs entirely in the browser. It renders
millions of points with WebGL2 and stays responsive while you pan and zoom.
There is no backend: your files are parsed, stored and rendered locally and
never leave the browser. It installs as a PWA and works offline.

**Open it:** <https://michaelkrisper.github.io/webgraphy/>

## Features

**Import**
- CSV, TSV, TXT/DAT, JSON, XLSX, XLS and ODS, via file picker or drag and drop;
  several files at once.
- Paste cells copied from a spreadsheet with Ctrl+V.
- Installed as a PWA, WebGraphy registers as a file handler, so supported files
  (and `.webgraphy` sessions) can be opened from the OS.
- An import dialog previews the file before it is loaded. CSV is parsed as a
  stream in a worker and the preview reads only the first 256 KiB; JSON is
  parsed whole in the worker; spreadsheets go through a separate worker and are
  limited to 100 MB.

**Plotting**
- WebGL2 rendering in a worker (`OffscreenCanvas`, main-thread fallback); M4
  decimation keeps millions of points interactive.
- Up to 9 X axes and 9 Y axes, linear or logarithmic; numeric, date/time or
  categorical X values.
- Calculated Columns: a formula engine with math, rolling/time/group
  statistics, filters and regression fits. The full list of functions is in
  the in-app **Function reference** of the Calculated Column dialog.

**Exploring**
- Pan and zoom with mouse or keyboard, Ctrl+drag box zoom, per-axis zoom and
  pan, Fit All and Stacked Fit.
- Zoom history (Alt+Left / Alt+Right) and exact axis ranges (right-click an
  axis, or focus it and press R).
- Crosshair tooltip that snaps to the nearest points; Ctrl+C copies it.
- Measurement pins: click the plot to set A and B and read Δ and slope (Δ/Δx).
- Statistics of the visible range (n, min, max, mean, std), toggled with S.
- Undo/redo for edits; data table of the plotted series.

**Output and state**
- CSV export of a whole dataset or of the visible range.
- Image export as SVG or PNG: size presets (current view, fixed pixel sizes,
  journal column widths in mm) or a custom size in px or mm, DPI, legend
  position, title, transparent background.
- Sessions: save and reopen the whole workspace as a `.webgraphy` file.
- Themes: Light, Dark, Matrix, Winnie, Unicorn.
- Offline PWA; a toast offers to reload when a new version is available.
- Everything is persisted in IndexedDB and restored on the next visit. The app
  asks the browser for persistent storage, and the sidebar footer shows usage,
  quota and whether storage is protected from eviction.

## Mouse

| Action                   | Effect                                    |
| ------------------------ | ----------------------------------------- |
| Wheel / drag on the plot | Zoom / pan all axes                       |
| Shift + wheel / drag     | Keep all X axes synchronised              |
| Ctrl + drag              | Box zoom                                  |
| Double-click the plot    | Fit all axes                              |
| Wheel / drag on an axis  | Zoom / pan only that axis                 |
| Double-click an X axis   | Auto-scale it (on the title: rename)      |
| Double-click a Y axis    | Fit it to the data in the visible X range |
| Right-click an axis      | Type an exact range                       |
| Click the plot           | Set measurement pins A, B                 |

## Keyboard shortcuts

Press `?` in the app to see this list. It is generated from
`src/utils/shortcuts.ts`, the same table the handlers use.

**Chart**

| Keys         | Action                                                     |
| ------------ | ---------------------------------------------------------- |
| ← / →        | Pan all X axes                                             |
| ↑ / ↓        | Pan all Y axes                                             |
| + / =        | Zoom in (X and Y)                                          |
| - / _        | Zoom out (X and Y)                                         |
| Ctrl + + / - | Zoom the X axes only                                       |
| Home         | Fit all axes to the data                                   |
| Shift + Home | Stacked fit: each Y axis in its own slice                  |
| Alt + ←      | Previous view (zoom history)                               |
| Alt + →      | Next view (zoom history)                                   |
| Ctrl + C     | Copy the crosshair tooltip data                            |
| S            | Show statistics of the visible range                       |
| Esc          | Clear the measurement cursors (click the plot to pin A, B) |
| ?            | Show keyboard shortcuts                                    |

**Focused axis (Tab to an axis)**

| Keys  | Action                                   |
| ----- | ---------------------------------------- |
| ← / → | Pan the focused X axis                   |
| ↑ / ↓ | Pan the focused Y axis                   |
| + / = | Zoom in on the focused axis              |
| - / _ | Zoom out of the focused axis             |
| A     | Auto-scale the focused axis              |
| R     | Type an exact range for the focused axis |
| Enter | Rename the focused X axis                |

**Edit**

| Keys     | Action                                 |
| -------- | -------------------------------------- |
| Ctrl + Z | Undo                                   |
| Ctrl + Y | Redo (also Ctrl+Shift+Z)               |
| Ctrl + V | Import cells copied from a spreadsheet |

**Dialogs**

| Keys | Action           |
| ---- | ---------------- |
| Esc  | Close the dialog |

## Privacy

- Your data stays in the browser: datasets, series configuration and view
  state live in IndexedDB; only the theme and a few small preferences (such as
  image-export settings) use localStorage. Nothing is uploaded.
- Page views are counted with [GoatCounter](https://www.goatcounter.com/): one
  first-party beacon request per page load (path, title, referrer, screen
  width), no cookies and no third-party script. It is not sent on localhost or
  inside frames. To opt out, run `localStorage.setItem("skipgc", "t")` in the
  browser console.

## Development

Requires Node.js >= 24 and npm.

```bash
npm install
npm run dev
```

| Script                            | Purpose                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `npm run preview` | Vite dev server / serve the production build                                                                      |
| `npm run build`                   | Type-check (`tsc -b`) and `vite build` in parallel; either failing fails the build                                |
| `npm run typecheck`               | `tsc -b` only                                                                                                     |
| `npm run lint`                    | ESLint (Biome only formats)                                                                                       |
| `npm run format` / `format:check` | Biome formatter; CI enforces `format:check`                                                                       |
| `npm test`                        | Vitest, one-shot; `npx vitest run --coverage` enforces the coverage thresholds as CI does                         |
| `npm run e2e`                     | Playwright smoke and visual regression against the production build (`npx playwright install chromium` first)     |
| `npm run size:check`              | Production build vs. the gzipped budget in `size-budget.json`; `npm run analyze` writes `dist/bundle-report.html` |
| `npm run bench:check`             | Hot-path benchmarks vs. `bench-baseline.json`; advisory locally, binding in CI                                    |

When you change `package.json`, commit the updated `package-lock.json` with it.
Run format, lint and tests before opening a pull request.

### CI and deployment

A single workflow, [`.github/workflows/ci.yml`](.github/workflows/ci.yml), runs
on pull requests and pushes to `main`:

- `quality`: format check, lint, tests with coverage, build, size budget.
- `e2e`: Playwright in a pinned container.
- `bench`: benchmarks against the baseline.
- `deploy`: publishes `dist` to GitHub Pages, on `main` only, after `quality`
  passes.

Screenshot baselines are generated only by CI, never locally. To refresh them
after an intentional UI change, run the workflow manually with
`update-snapshots` (`gh workflow run CI --ref <branch> -f update-snapshots=true`),
then download the `e2e-snapshots` artifact, review and commit it.

`CLAUDE.md` describes the architecture (workers, store, persistence, renderer).

## License

[MIT](LICENSE) © Michael Krisper
