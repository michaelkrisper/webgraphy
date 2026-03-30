# Webgraphy

Webgraphy is a precision-focused, high-performance data visualization application designed to handle extremely large datasets (millions of points) with smooth interaction and visual integrity. It leverages custom WebGL rendering and advanced data management strategies to provide a responsive charting experience.

## Features

- **High Performance:** Render millions of data points effortlessly using raw WebGL with custom shaders.
- **Precision:** Ultra-precision and high-throughput drawing using relative offsets to handle large coordinate values without floating-point artifacts.
- **Smart Data Handling:** Concurrency with Web Workers for heavy data parsing (CSV/JSON), coupled with Level of Detail (LOD) generation (Min/Max decimation).
- **Persistence:** Local datasets and application state are persisted securely across sessions via IndexedDB and LocalStorage in the browser.
- **Export:** Easily export charts into SVG or PNG formats.
- **Flexibility:** Configure datasets flexibly, switch axes dynamically (e.g., date-based or numeric x-axis).

## Core Technologies

- **Frontend:** React 19, TypeScript, Vite 8
- **Rendering:** Raw WebGL
- **State Management:** Zustand
- **Persistence:** IndexedDB (`idb`), LocalStorage

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

```bash
npm run deploy
```

The application is configured to deploy to the `gh-pages` branch. The process is handled seamlessly by the deployment script.

## License

This project is licensed under the MIT License.
