import sys

def main():
    filepath = 'src/hooks/usePanZoom.ts'
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Update performZoom signature and add panDx, panDy
    content = content.replace(
        'zoomFactor: number | { x: number; y: number },',
        'zoomFactor: number | { x: number; y: number },'
    )
    # Actually, we don't need to change performZoom signature again, we can just apply the panDx and panDy *AFTER* performZoom.

    old_tm = """					if (target === "all" || (target && typeof target === "object" && "xAxisId" in target)) {
						activeXAxes.forEach(a => {
							const cur = targetXAxes.current[a.id];
							if (cur) {
								const pxPerWorld = chartWidth / (cur.max - cur.min);
								const shiftWorld = panDx / pxPerWorld;
								// Important: using cur.min and cur.max directly will mutate the ref which is correct
								cur.min -= shiftWorld;
								cur.max -= shiftWorld;
							}
						});
					}

					if (target === "all" || (target && typeof target === "object" && "yAxisId" in target)) {
						activeYAxes.forEach(a => {
							const cur = targetYs.current[a.id];
							if (cur) {
								const pxPerWorld = chartHeight / (cur.max - cur.min);
								const shiftWorld = panDy / pxPerWorld;
								cur.min += shiftWorld;
								cur.max += shiftWorld;
							}
						});
					}

					lastPinchDist.current = { dist, cx, cy };

					performZoom(
						{ x: zfX, y: zfY },
						cx - rect.left,
						cy - rect.top,
						target || "all",
						e.shiftKey,
					);"""

    new_tm = """					lastPinchDist.current = { dist, cx, cy };

					performZoom(
						{ x: zfX, y: zfY },
						cx - rect.left,
						cy - rect.top,
						target || "all",
						e.shiftKey,
					);

					// Apply pan AFTER performZoom overwrites the refs
					if (target === "all" || (target && typeof target === "object" && "xAxisId" in target)) {
						activeXAxes.forEach(a => {
							const cur = targetXAxes.current[a.id];
							if (cur) {
								const pxPerWorld = chartWidth / (cur.max - cur.min);
								const shiftWorld = panDx / pxPerWorld;
								cur.min -= shiftWorld;
								cur.max -= shiftWorld;
							}
						});
					}

					if (target === "all" || (target && typeof target === "object" && "yAxisId" in target)) {
						activeYAxes.forEach(a => {
							const cur = targetYs.current[a.id];
							if (cur) {
								const pxPerWorld = chartHeight / (cur.max - cur.min);
								const shiftWorld = panDy / pxPerWorld;
								cur.min += shiftWorld;
								cur.max += shiftWorld;
							}
						});
					}

					// Important: performZoom calls syncViewport() at the end.
					// Since we modify the refs *after* performZoom, we must sync the viewport again
					// to flush our pan adjustments to the actual component state.
					syncViewport();"""

    content = content.replace(old_tm, new_tm)

    with open(filepath, 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
