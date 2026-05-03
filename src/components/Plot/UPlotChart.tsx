import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useGraphStore } from '../../store/useGraphStore';
import { getColumnIndex } from '../../utils/columns';

export function UPlotChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const datasets = useGraphStore(s => s.datasets);
  const series = useGraphStore(s => s.series);
  const xAxes = useGraphStore(s => s.xAxes);
  const yAxes = useGraphStore(s => s.yAxes);

  useEffect(() => {
    if (!containerRef.current || datasets.length === 0 || series.length === 0) return;

    plotRef.current?.destroy();

    // Use first xAxis for x range
    const xAxis = xAxes[0];
    if (!xAxis) return;

    // Find the dataset/column for each series x values
    // uPlot expects: data[0] = x values, data[1..n] = y values for each series
    // All series must share the same x array — use first series' dataset x column
    const firstSeries = series[0];
    const firstDs = datasets.find(d => d.id === firstSeries.sourceId);
    if (!firstDs) return;

    const xColIdx = getColumnIndex(firstDs, firstDs.xAxisColumn);
    const xCol = firstDs.data[xColIdx];
    if (!xCol) return;

    // Reconstruct absolute x values from relative Float32Array + refPoint
    const xAbsolute = new Float64Array(xCol.data.length);
    for (let i = 0; i < xCol.data.length; i++) {
      xAbsolute[i] = xCol.data[i] + xCol.refPoint;
    }

    const uData: uPlot.AlignedData = [xAbsolute as unknown as number[]];
    const uSeries: uPlot.Series[] = [{}]; // x series placeholder

    for (const s of series) {
      if (s.hidden) {
        uData.push([]);
        uSeries.push({ show: false });
        continue;
      }
      const ds = datasets.find(d => d.id === s.sourceId);
      if (!ds) { uData.push([]); uSeries.push({}); continue; }

      const yColIdx = getColumnIndex(ds, s.yColumn);
      const yCol = ds.data[yColIdx];
      if (!yCol) { uData.push([]); uSeries.push({}); continue; }

      const yAbsolute = new Float64Array(yCol.data.length);
      for (let i = 0; i < yCol.data.length; i++) {
        yAbsolute[i] = yCol.data[i] + yCol.refPoint;
      }

      uData.push(yAbsolute as unknown as number[]);

      const yAxis = yAxes.find(a => a.id === s.yAxisId);
      uSeries.push({
        label: s.name,
        stroke: s.lineColor,
        width: s.lineWidth ?? 1,
        show: !s.hidden,
        scale: yAxis?.id ?? 'y',
        points: {
          show: s.lineStyle === 'none',
          size: 4,
          fill: s.lineColor,
        },
        dash: s.lineStyle === 'dashed' ? [8, 4] : s.lineStyle === 'dotted' ? [2, 4] : undefined,
      });
    }

    // Build uPlot scales from yAxes
    const scales: uPlot.Scales = {
      x: { min: xAxis.min, max: xAxis.max },
    };
    for (const ya of yAxes) {
      scales[ya.id] = { min: ya.min, max: ya.max };
    }

    // Build uPlot axes config
    const axes: uPlot.Axis[] = [
      { scale: 'x', label: xAxis.name },
    ];
    for (const ya of yAxes) {
      axes.push({
        scale: ya.id,
        label: ya.name,
        side: ya.position === 'right' ? 1 : 3,
        stroke: ya.color,
      });
    }

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth || 800,
      height: 400,
      scales,
      axes,
      series: uSeries,
      cursor: { drag: { x: true, y: false } },
    };

    plotRef.current = new uPlot(opts, uData, containerRef.current);

    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [datasets, series, xAxes, yAxes]);

  return (
    <div style={{ padding: '1rem', background: '#1a1a1a', borderTop: '2px solid #444' }}>
      <div style={{ color: '#aaa', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
        uPlot PoC
      </div>
      <div ref={containerRef} />
    </div>
  );
}
