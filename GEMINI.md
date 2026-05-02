# Webgraphy: High-Performance Data Visualization

`webgraphy` is a precision-focused, high-performance data visualization application designed to handle extremely large datasets (millions of points) with smooth interaction and visual integrity. It leverages custom WebGL rendering and advanced data management strategies to provide a responsive charting experience.

## Core Technologies

- **Frontend:** React 19, TypeScript, Vite 8.
- **Rendering:** Raw WebGL with custom shaders for ultra-precision and high-throughput drawing.
- **State Management:** Zustand for application state (series configuration, viewport, axes).
- **Persistence:** 
    - **IndexedDB (`idb`):** Stores large datasets for fast retrieval across sessions.
    - **LocalStorage:** Stores UI state and application configuration.
- **Concurrency:** Web Workers for heavy data parsing (CSV/JSON).
- **Optimization:** Direct raw data rendering path optimized for massive datasets.

## Architecture & Data Flow

1.  **Data Import:** Files (CSV/JSON) are read and passed to `data-parser.worker.ts`.
2.  **Processing:** The worker parses the data, calculates bounds, and transforms values to relative offsets (`refPoint`) for high-precision rendering.
3.  **Persistence:** The processed dataset is stored in IndexedDB.
4.  **State Sync:** `useGraphStore` (Zustand) manages the active datasets and series configurations.
5.  **Rendering:** `WebGLRenderer` consumes datasets and series configs and renders raw data to a canvas using specialized shaders. To ensure high responsiveness during interaction, the renderer bypasses the global store and React render cycle for per-frame updates.

## Key Directories

- `src/components/Plot/`: Core rendering components, including `WebGLRenderer` and `ChartContainer`.
- `src/store/`: Zustand stores for application state.
- `src/services/`: Persistence logic and data interfaces.
- `src/workers/`: Web Workers for non-blocking data processing.
- `src/utils/`: Helper functions for coordinates and data algorithms.

## Building and Running

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Linting
```bash
npm run lint
```

### Deployment
The project is configured for deployment to GitHub Pages.
```bash
npm run deploy
```

## Development Conventions

- **Token Optimization:** 
    - Use `code-graph` MCP (`search_code`, `get_dependencies`) to map data flows between Web Workers, IndexedDB, and the WebGL renderer before reading source files.
    - Use `refactor` MCP for consistent updates across React components or shader uniforms.
- **Performance First:** Heavy processing must stay in Web Workers. WebGL is the primary rendering path for data.
- **Precision:** Shaders are designed for ultra-precision, using relative offsets (`refPoint`) to handle large coordinate values without floating-point artifacts.
- **Type Safety:** Strict TypeScript usage is encouraged across the codebase.
- **Persistence Awareness:** Any changes to the `GraphState` that should survive a refresh must be persisted via the `persistence` service.
