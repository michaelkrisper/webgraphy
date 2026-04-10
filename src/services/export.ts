import { type Dataset, type SeriesConfig, type YAxisConfig, type XAxisConfig } from './persistence';
import { worldToScreen } from '../utils/coords';
import { lttb } from '../utils/lttb';

const AXIS_WIDTH_BASE = 15; // Ticks, gap, and safe margin

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
  '=': '&#061;'
};

const escapeHTML = (str: string | undefined | null): string => {
  if (!str) return '';
  return String(str).replace(/[&<>"'=]/g, (s) => HTML_ESCAPE_MAP[s] || s);
};

/**
 * exportToSVG (v2.4 - Dynamic Spacing & Decimal Alignment)
 * Generates a high-quality SVG that matches the PlotArea visuals exactly.
 */
export const exportToSVG = (
  datasets: Dataset[], 
  series: SeriesConfig[], 
  xAxes: XAxisConfig[],
  yAxes: YAxisConfig[],
  _axisTitles: { x: string, y: string },
  width: number,
  height: number
): string => {
  // 1. Determine active axes and layout
  const axisToMinDsIdx = new Map<string, number>();
  datasets.forEach((d, dsIdx) => {
    if (!series.some(s => s.sourceId === d.id)) return;
    const xId = d.xAxisId || 'axis-1';
    if (!axisToMinDsIdx.has(xId) || dsIdx < axisToMinDsIdx.get(xId)!) {
      axisToMinDsIdx.set(xId, dsIdx);
    }
  });
  const usedXAxisIds = Array.from(axisToMinDsIdx.keys());
  const activeXAxes = xAxes
    .filter(a => usedXAxisIds.includes(a.id))
    .sort((a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0));

  const usedAxisIds = new Set(series.map(s => s.yAxisId));
  const activeYAxes = yAxes.filter(a => usedAxisIds.has(a.id));
  const leftAxes = activeYAxes.filter(a => a.position === 'left');
  const rightAxes = activeYAxes.filter(a => a.position === 'right');

  // Helper to calculate required axis width
  const getAxisWidth = (axis: YAxisConfig) => {
    const range = axis.max - axis.min;
    const step = range / Math.max(2, Math.floor(height / 30));
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
    const normalizedStep = step / magnitude;
    const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
    const actualStep = finalStep * magnitude;
    const precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1)));
    
    const widestVal = Math.max(axis.min.toFixed(precision).length, axis.max.toFixed(precision).length);
    return widestVal * 6 + AXIS_WIDTH_BASE;
  };

  const axisWidthMap: Record<string, number> = {};
  activeYAxes.forEach(a => axisWidthMap[a.id] = getAxisWidth(a));

  // ⚡ Bolt Optimization: Pre-calculate Y-axis cumulative offsets to replace O(N^2) inline loop lookups with O(1) property access
  const yAxesOffsets: Record<string, number> = {};
  let leftCumulative = 0;
  for (const axis of leftAxes) {
    yAxesOffsets[axis.id] = leftCumulative;
    leftCumulative += axisWidthMap[axis.id];
  }
  let rightCumulative = 0;
  for (const axis of rightAxes) {
    yAxesOffsets[axis.id] = rightCumulative;
    rightCumulative += axisWidthMap[axis.id];
  }

  const leftSum = leftCumulative;
  const rightSum = rightCumulative;

  const padding = {
    top: 20,
    right: 20 + rightSum,
    bottom: 60 + (activeXAxes.length - 1) * 60,
    left: 20 + leftSum
  };

  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);
  
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: white; font-family: sans-serif;">`;
  
  svg += `<rect width="100%" height="100%" fill="white" />`;

  // 2. Draw Grid
  const gridAxis = activeYAxes.find(a => a.showGrid) || activeYAxes[0];
  const gridXAxis = activeXAxes[0];
  if (gridAxis && gridXAxis) {
    const yRange = gridAxis.max - gridAxis.min;
    const yStep = yRange / Math.max(2, Math.floor(chartHeight / 30));
    const firstYTick = Math.ceil(gridAxis.min / yStep) * yStep;
    const vp = { xMin: gridXAxis.min, xMax: gridXAxis.max, yMin: gridAxis.min, yMax: gridAxis.max, width, height, padding };
    for (let t = firstYTick; t <= gridAxis.max; t += yStep) {
      const { y } = worldToScreen(gridXAxis.min, t, vp);
      svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#f0f0f0" stroke-width="1" />`;
    }

    const xRange = gridXAxis.max - gridXAxis.min;
    const xStep = xRange / Math.max(2, Math.floor(chartWidth / 60));
    const firstXTick = Math.ceil(gridXAxis.min / xStep) * xStep;
    for (let t = firstXTick; t <= gridXAxis.max; t += xStep) {
      const { x } = worldToScreen(t, gridAxis.min, vp);
      svg += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="#f0f0f0" stroke-width="1" />`;
    }
  }

  // 3. Draw Series Data
  series.forEach(s => {
    const ds = datasets.find(d => d.id === s.sourceId);
    const xAxis = xAxes.find(a => a.id === (ds?.xAxisId || 'axis-1'));
    const yAxis = yAxes.find(a => a.id === s.yAxisId);
    if (!ds || !xAxis || !yAxis) return;

    const findColumn = (name: string) => {
      const idx = ds.columns.indexOf(name);
      if (idx !== -1) return idx;
      return ds.columns.findIndex(c => c.endsWith(`: ${name}`) || c === name);
    };

    const xIdx = findColumn(ds.xAxisColumn);
    const yIdx = findColumn(s.yColumn);
    if (xIdx === -1 || yIdx === -1) return;

    const xCol = ds.data[xIdx], yCol = ds.data[yIdx], visibleData = [];
    const xData = xCol.data, yData = yCol.data;
    for (let i = 0; i < ds.rowCount; i++) {
      const vx = xData[i] + xCol.refPoint;
      const vy = yData[i] + yCol.refPoint;
      if (vx >= xAxis.min && vx <= xAxis.max) visibleData.push({ x: vx, y: vy });
    }
    const sampledData = visibleData.length > 5000 ? lttb(visibleData, 5000) : visibleData;
    const seriesVp = { xMin: xAxis.min, xMax: xAxis.max, yMin: yAxis.min, yMax: yAxis.max, width, height, padding };
    const screenPoints = sampledData.map(p => worldToScreen(p.x, p.y, seriesVp));
    if (screenPoints.length > 1 && s.lineStyle !== 'none') {
      const pathData = screenPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      let dashArray = ''; if (s.lineStyle === 'dashed') dashArray = 'stroke-dasharray="8,6"'; else if (s.lineStyle === 'dotted') dashArray = 'stroke-dasharray="2,4"';
      svg += `<path d="${pathData}" fill="none" stroke="${escapeHTML(s.lineColor)}" stroke-width="${s.lineWidth || 1}" ${dashArray} />`;
    }
    if (s.pointStyle !== 'none') {
      screenPoints.forEach(p => {
        if (s.pointStyle === 'circle') svg += `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${escapeHTML(s.pointColor)}" />`;
        else if (s.pointStyle === 'square') svg += `<rect x="${p.x - 2.5}" y="${p.y - 2.5}" width="5" height="5" fill="${escapeHTML(s.pointColor)}" />`;
        else if (s.pointStyle === 'cross') svg += `<path d="M ${p.x - 2.5} ${p.y - 2.5} L ${p.x + 2.5} ${p.y + 2.5} M ${p.x + 2.5} ${p.y - 2.5} L ${p.x - 2.5} ${p.y + 2.5}" stroke="${escapeHTML(s.pointColor)}" stroke-width="1" />`;
      });
    }
  });

  // 4. Draw Axes
  svg += `<rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="#333" stroke-width="2" />`;

  activeXAxes.forEach((axis, idx) => {
    const xRange = axis.max - axis.min;
    const xStep = xRange / Math.max(2, Math.floor(chartWidth / 60));
    const firstXTick = Math.ceil(axis.min / xStep) * xStep;
    const xPrecision = Math.max(0, -Math.floor(Math.log10(xStep || 1)));
    const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding };
    const baseY = height - padding.bottom + idx * 60;

    svg += `<line x1="${padding.left}" y1="${baseY}" x2="${width - padding.right + 8}" y2="${baseY}" stroke="#333" stroke-width="1" />`;

    for (let t = firstXTick; t <= axis.max; t += xStep) {
      const { x } = worldToScreen(t, 0, vp);
      if (x < padding.left || x > width - padding.right) continue;
      svg += `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY + 6}" stroke="#333" stroke-width="1" />`;
      const label = axis.xMode === 'date' ? formatDate(t, xStep) : t.toFixed(xPrecision);
      svg += `<text x="${x}" y="${baseY + 20}" text-anchor="middle" font-size="9" fill="#666">${label}</text>`;
    }

    const datasetsForThisAxis = datasets.filter(d => (d.xAxisId || 'axis-1') === axis.id && series.some(s => s.sourceId === d.id));
    const seriesForThisAxis = series.filter(s => datasetsForThisAxis.some(d => d.id === s.sourceId));
    const title = Array.from(new Set(datasetsForThisAxis.map(d => d.xAxisColumn))).join(' / ');
    svg += `<text x="${padding.left + chartWidth / 2}" y="${baseY + 42}" text-anchor="middle" font-size="10" font-weight="bold" fill="${escapeHTML(seriesForThisAxis[0]?.lineColor || '#333')}">${escapeHTML(title)}</text>`;
  });

  activeYAxes.forEach(axis => {
    const isLeft = axis.position === 'left';
    const axisWidth = axisWidthMap[axis.id];
    let xPos = 0;
    if (isLeft) {
      xPos = padding.left - (yAxesOffsets[axis.id] || 0) - axisWidth;
    } else {
      xPos = width - padding.right + (yAxesOffsets[axis.id] || 0);
    }
    
    const range = axis.max - axis.min, step = range / Math.max(2, Math.floor(chartHeight / 30));
    const firstTick = Math.ceil(axis.min / step) * step;
    const precision = Math.max(0, -Math.floor(Math.log10(step || 1)));

    // Axis Line
    const lineX = xPos + (isLeft ? axisWidth : 0);
    svg += `<line x1="${lineX}" y1="${padding.top}" x2="${lineX}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1" />`;

    // Ticks and Labels (Right-Aligned)
    const mainXConf = activeXAxes[0] || xAxes[0];
    for (let t = firstTick; t <= axis.max; t += step) {
      const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
      svg += `<line x1="${lineX - (isLeft ? 5 : 0)}" y1="${y}" x2="${lineX + (isLeft ? 0 : 5)}" y2="${y}" stroke="#333" stroke-width="1" />`;
      const labelX = xPos + axisWidth - 8;
      svg += `<text x="${labelX}" y="${y + 3}" text-anchor="end" font-size="9" fill="#333">${t.toFixed(precision)}</text>`;
    }

    const axisSeries = series.filter(s => s.yAxisId === axis.id);
    const title = axisSeries.map(s => s.name || s.yColumn).join(' / ');
    const titleX = isLeft ? (xPos + 5) : (xPos + axisWidth - 5);
    const titleY = padding.top + chartHeight / 2, rotate = isLeft ? -90 : 90;
    const estW = Math.min(chartHeight, title.length * 6 + 8);
    svg += `<g transform="translate(${titleX}, ${titleY}) rotate(${rotate})">`;
    svg += `<rect x="-${estW / 2}" y="-8" width="${estW}" height="16" fill="rgba(255, 255, 255, 0.8)" rx="2" />`;
    svg += `<text x="0" y="4" text-anchor="middle" font-size="10" font-weight="bold" fill="${escapeHTML(axisSeries[0]?.lineColor || '#333')}">${escapeHTML(title)}</text></g>`;
  });

  svg += `</svg>`; return svg;
};

export const formatDate = (val: number, step: number) => {
  const d = new Date(val * 1000);
  if (step >= 86400) return d.getDate() + '.' + (d.getMonth() + 1) + '.';
  if (step >= 3600) return d.getHours() + ':00';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

export const exportToPNG = async (datasets: Dataset[], series: SeriesConfig[], xAxes: XAxisConfig[], yAxes: YAxisConfig[], axisTitles: { x: string, y: string }, width: number, height: number): Promise<string> => {
  const svgString = exportToSVG(datasets, series, xAxes, yAxes, axisTitles, width, height);
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr);
    const img = new Image(), svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }), url = URL.createObjectURL(svgBlob);
    img.onload = () => { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/png')); };
    img.src = url;
  });
};

export const downloadFile = (content: string, fileName: string, contentType: string) => {
  const a = document.createElement('a');
  const isDataUrl = content.startsWith('data:');
  if (isDataUrl) {
    a.href = content;
  } else {
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
  }
  a.download = fileName;
  a.click();
  if (!isDataUrl) {
    // Security/Memory leak prevention: revoke the object URL after download
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  }
};
