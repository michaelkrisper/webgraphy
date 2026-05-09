# Graph Report - .  (2026-05-09)

## Corpus Check
- 90 files · ~75 731 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 206 nodes · 309 edges · 11 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 90 · Candidates: 101
- Excluded: 85 untracked · 126754 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `d840666`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `ErrorBoundary` - 5 edges
2. `calcYAxisTicks()` - 5 edges
3. `rgbToHex()` - 4 edges
4. `handleHueMove()` - 4 edges
5. `getDemoAppState()` - 4 edges
6. `parseCSV()` - 4 edges
7. `parseValue()` - 4 edges
8. `hslToRgb()` - 3 edges
9. `handleBrightnessMove()` - 3 edges
10. `exportToSVG()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (3): formatPrimaryLabel(), formatPrimaryLabelFromDate(), generateTimeTicks()

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (4): MockWorker, compileFormula(), evaluateFormulaSync(), tryRegressionFormula()

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (4): applyTheme(), loadFont(), MockBlob, MockImage

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (3): escapeHTML(), exportToPNG(), exportToSVG()

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (1): MockFileReader

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (8): handleBrightnessMove(), handleHueMove(), handleRgbChange(), hslToRgb(), move(), rgbToHex(), cycleYAxis(), handleUpdate()

### Community 7 - "Community 7"
Cohesion: 0.27
Nodes (6): createDemoSeries(), createDemoXAxes(), createDemoYAxes(), generateDemoDataset(), generateRawWeatherData(), getDemoAppState()

### Community 8 - "Community 8"
Cohesion: 0.2
Nodes (1): ErrorBoundary

### Community 9 - "Community 9"
Cohesion: 0.36
Nodes (7): parseCSV(), parseData(), parseDate(), parseJSON(), parseValue(), processCSVHeader(), processCSVRow()

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (4): exponentialRegression(), linearRegression(), polynomialRegression(), solveLinearSystem()

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): calcCategoricalTicks(), calcNumericPrecision(), calcNumericStep(), calcNumericTicks(), calcYAxisTicks()

## Knowledge Gaps
- **Thin community `Community 5`** (1 nodes): `MockFileReader`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (1 nodes): `ErrorBoundary`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._