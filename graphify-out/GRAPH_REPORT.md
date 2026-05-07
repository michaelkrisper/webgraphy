# Graph Report - webgraphy  (2026-05-07)

## Corpus Check
- 83 files · ~66,458 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 268 nodes · 502 edges · 19 communities (17 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fc625149`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]

## God Nodes (most connected - your core abstractions)
1. `Architecture Overview` - 9 edges
2. `getColumnIndex()` - 7 edges
3. `tryRegressionFormula()` - 7 edges
4. `secureJSONParse()` - 7 edges
5. `calcYAxisTicks()` - 7 edges
6. `exportToSVG()` - 7 edges
7. `Webgraphy: High-Performance Data Visualization` - 7 edges
8. `Development` - 7 edges
9. `linearRegression()` - 6 edges
10. `polynomialRegression()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `createSeries()` --calls--> `buildSeriesConfig()`  [INFERRED]
  src/components/Layout/Sidebar.tsx → src/utils/series.ts
- `exportToSVG()` --calls--> `worldToScreen()`  [INFERRED]
  src/services/export.ts → src/utils/coords.ts
- `parseJSON()` --calls--> `secureJSONParse()`  [INFERRED]
  src/utils/data-parser.ts → src/utils/json.ts
- `handleImportSession()` --calls--> `importSession()`  [INFERRED]
  src/components/Layout/Sidebar.tsx → src/services/session.ts
- `generateRawWeatherData()` --calls--> `secureRandom()`  [INFERRED]
  src/services/demoData.ts → src/utils/random.ts

## Communities (19 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (17): CollapsedMenuButton(), HelpModal(), ImprintModal(), LicenseModal(), createSeries(), handleExportPNG(), handleExportSession(), handleExportSVG() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (18): usePanZoom(), calcCategoricalTicks(), calcNumericPrecision(), calcNumericStep(), calcNumericTicks(), calcYAxisTicks(), formatAxisLabel(), syncAxesWithTargets() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (9): useAutoScale(), createDemoSeries(), createDemoXAxes(), createDemoYAxes(), generateDemoDataset(), generateRawWeatherData(), getDemoAppState(), getColumnIndex() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.19
Nodes (11): MockWorker, processRawColumn(), compileFormula(), evaluateFormulaSync(), tryRegressionFormula(), exponentialRegression(), kdeSmoothing(), linearRegression() (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (20): Axes (X & Y), Build, code:bash (npm install), code:bash (npm run dev), code:bash (npm run build), code:bash (npm run lint), code:bash (npm run test), code:bash (npm run deploy) (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (8): handleBrightnessMove(), handleHueMove(), handleRgbChange(), hslToRgb(), move(), rgbToHex(), cycleYAxis(), handleUpdate()

### Community 6 - "Community 6"
Cohesion: 0.2
Nodes (9): useDataImport(), MockFileReader, parseCSV(), parseData(), parseDate(), parseJSON(), parseValue(), processCSVHeader() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (15): Architecture & Data Flow, Build, Building and Running, code:bash (npm run dev), code:bash (npm run build), code:bash (npm run lint), code:bash (npm run deploy), Core Technologies (+7 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (13): Architecture Overview, code:bash (npm run dev        # Start Vite dev server), code:block2 (CSV/JSON file → src/utils/data-parser.ts (Synchronous parser), Commands, Data Flow, Deployment, Formula & Regression System, graphify (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (4): ImportSettingsDialog(), handleImportSession(), importSession(), secureJSONParse()

### Community 11 - "Community 11"
Cohesion: 0.43
Nodes (3): hexToRgba(), m4ByXFloat32(), m4Float32()

### Community 13 - "Community 13"
Cohesion: 0.38
Nodes (3): applyTheme(), loadFont(), useTheme()

## Knowledge Gaps
- **31 isolated node(s):** `Core Technologies`, `Architecture & Data Flow`, `Key Directories`, `code:bash (npm run dev)`, `code:bash (npm run build)` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `processRawColumn()` connect `Community 3` to `Community 6`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `tryRegressionFormula()` (e.g. with `linearRegression()` and `polynomialRegression()`) actually correct?**
  _`tryRegressionFormula()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `secureJSONParse()` (e.g. with `parseJSON()` and `importSession()`) actually correct?**
  _`secureJSONParse()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Core Technologies`, `Architecture & Data Flow`, `Key Directories` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._