1. **Analyze:** The issue is that `ChartContainer.tsx` repeatedly recreates `datasetsById`, `xAxesById`, and `yAxesById` maps in multiple places, especially within bounds checking (`useEffect`) and `handleAutoScaleY` which are frequently triggered performance-sensitive paths.
2. **Benchmark:** Create a benchmark using `WeakMap` showing O(1) performance vs Map re-creation which is O(N) allocation and populating overhead.
3. **Optimize:** I will create utility functions `getDatasetsMap`, `getXAxesMap`, and `getYAxesMap` at the module level in `ChartContainer.tsx` using `WeakMap` cache.
   - `getDatasetsMap(datasets: Dataset[])` returns a `Map<string, Dataset>`.
   - `getXAxesMap(xAxes: XAxisConfig[])` returns a `Map<string, XAxisConfig>`.
   - `getYAxesMap(yAxes: YAxisConfig[])` returns a `Map<string, YAxisConfig>`.
4. **Refactor:** Replace the inline `new Map()` loops with these cache lookup functions in:
   - `Crosshair`'s `seriesMetadata` useMemo
   - `ChartContainer`'s `useEffect` (around line 630)
   - `ChartContainer`'s `handleAutoScaleY`
5. **Verify:** Run the tests, `eslint`, and ensure all maps behave identically.
6. **Pre-commit:** Run the `pre_commit_instructions` tool.
7. **Submit:** Present PR with performance impact.
