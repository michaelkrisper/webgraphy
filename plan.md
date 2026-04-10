## Proposed Optimization

Currently, in both `src/components/Plot/ChartContainer.tsx` and `src/services/export.ts`, determining the offset (X position) for a Y-axis involves an O(N) loop iterating over all axes on the same side (`leftAxes` or `rightAxes`) up to the current axis index. This is done repeatedly during renders (especially during interactions where animations/panning cause high re-render rates), wheel handlers, mouse down events, and SVG export generation.

```javascript
// Current inefficient pattern:
const isLeft = axis.position === 'left', sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
// ...
let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
```

This makes the complexity O(N^2) relative to the number of Y-axes.

The optimization is to pre-calculate these cumulative offsets and store them in an object mapping `yAxis.id` to its cumulative offset. This lookup can then be O(1), similar to how `xAxesMetrics` currently handles `cumulativeOffset`.

### Target Files:
- `src/components/Plot/ChartContainer.tsx`
- `src/services/export.ts`

### Implementation steps
1. **In `ChartContainer.tsx`**: Add a `useMemo` (e.g., `yAxesMetrics`) that computes the cumulative offsets for all Y axes (left and right) once per layout change.
2. Replace all instances of the `for` loops computing offsets with an O(1) property lookup from this memoized map.
3. Apply a similar preprocessing step in `src/services/export.ts`.

