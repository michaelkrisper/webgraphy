1. Add a `useMemo` block in `src/components/Plot/ChartContainer.tsx` to pre-calculate cumulative layout offsets for the left and right Y-axes.
    - Let's call it `yAxisOffsets`. It will be a `Record<string, number>`.
    - It maps the axis ID to its cumulative offset from the inner edge of the plot.
    - Dependencies: `[leftAxes, rightAxes, axisLayout]`.

2. Replace the inner loops in `ChartContainer.tsx`:
    - Around line 219 and 222 (the main axes rendering loop).
    - Around line 315 and 318 (the axes titles rendering loop).
    - Around line 1133 and 1140 (in `getHoveredYAxis`).
    - Around line 1488 and 1491 (in the invisible interaction overlay loops).

    Replace this:
    ```typescript
    let offset = 0; for (let i = 0; i < sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
    ```
    with this:
    ```typescript
    let offset = yAxisOffsets[axis.id] || 0;
    ```

3. Complete pre commit steps
    - Call the pre commit tool to verify that lint, testing, and formatting pass.

4. Submit the change
    - Provide a description of the performance improvement (redundant nested loops removed, O(N^2) complexity reduced to O(N)).
