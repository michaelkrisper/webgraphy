## 2025-04-03 - O(N) Array Operations in High-Frequency Loops
**Learning:** `Array.find` and `Array.indexOf` inside React render hooks (like `useEffect` in `WebGLRenderer`) and high-frequency event handlers (like `mousemove` snapping in `ChartContainer`) cause noticeable overhead when interacting with the chart.
**Action:** Always pre-calculate and cache dependency data (like mapping Series to Datasets/Axes and resolving column indices) using `useMemo` before these high-frequency loops execute.
