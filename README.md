# Webgraphy

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](https://michaelkrisper.github.io/webgraphy/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Webgraphy is a precision-focused, high-performance data visualization application designed to handle extremely large datasets (millions of points) with smooth interaction and visual integrity. It leverages custom WebGL rendering and advanced data management strategies to provide a responsive charting experience.

**Live Demo:** [https://michaelkrisper.github.io/webgraphy/](https://michaelkrisper.github.io/webgraphy/)

## Key Features

- **Ultra High Performance:** Render millions of data points smoothly using raw WebGL with custom high-precision shaders.
- **Advanced Data Handling:** Multi-threaded data parsing (CSV/JSON) using Web Workers and Level of Detail (LOD) generation via min/max decimation to preserve visual outliers.
- **Rich Interaction:**
  - **Interactive Axes:** Pan and zoom directly on individual X or Y axes.
  - **Box Zoom:** `Ctrl + Drag` to precisely zoom into a specific region.
  - **Smart Snapping:** Y-axis zero-lines automatically snap to each other during dragging for easy alignment.
  - **Precision Crosshair:** High-performance data-snapping crosshair for accurate value inspection.
  - **Quick Scaling:** Double-click axes to auto-scale; smart Y-scaling based on click position.
- **Complex Visualizations:**
  - Support for up to 9 independent X and Y axes.
  - Flexible X-Axis modes (Numeric, Date/Time).
  - View Snapshots to save and recall specific zoom/pan states.
- **Robust Persistence:** Automatic state recovery across browser sessions using IndexedDB for large datasets and LocalStorage for UI configurations.
- **Professional Export:** High-quality export of charts to PNG or SVG formats.

## Core Technologies

- **Frontend:** React 19, TypeScript, Vite 8
- **Rendering:** Raw WebGL (Custom Shaders)
- **State Management:** Zustand
- **Persistence:** IndexedDB (`idb`), LocalStorage
- **Concurrency:** Web Workers

## Development

First, ensure you have Node.js installed. Clone the repository and install dependencies:

```bash
npm install
```

### Running Locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Deploy to GitHub Pages

The application is configured for automatic deployment to GitHub Pages via GitHub Actions on every push to the `master` branch.

To manually deploy from your local machine:
```bash
npm run deploy
```

The application will be available at `https://michaelkrisper.github.io/webgraphy/`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
