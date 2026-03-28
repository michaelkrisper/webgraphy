import { type Dataset, type SeriesConfig, type YAxisConfig } from './persistence';
import { worldToScreen } from '../utils/coords';
import { lttb } from '../utils/lttb';

const AXIS_WIDTH = 40;

/**
 * exportToSVG (v2.2)
 * Generates a high-quality SVG that matches the PlotArea visuals exactly.
 */
export const exportToSVG = (
  datasets: Dataset[], 
  series: SeriesConfig[], 
  yAxes: YAxisConfig[],
  viewportX: { min: number, max: number },
  axisTitles: { x: string, y: string },
  xMode: 'date' | 'numeric',
  width: number,
  height: number
): string => {
  // 1. Determine active axes and layout
  const usedAxisIds = new Set(series.map(s => s.yAxisId));
  const activeYAxes = yAxes.filter(a => usedAxisIds.has(a.id));
  const leftAxes = activeYAxes.filter(a => a.position === 'left');
  const rightAxes = activeYAxes.filter(a => a.position === 'right');

  const padding = {
    top: 20,
    right: 20 + (rightAxes.length * AXIS_WIDTH),
    bottom: 50,
    left: 20 + (leftAxes.length * AXIS_WIDTH)
  };

  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);
  
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: white; font-family: sans-serif;">`;
  
  // Background
  svg += `<rect width="100%" height="100%" fill="white" />`;

  // Helper for viewport mapping
  const vp = { xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding };

  // 2. Draw Grid (using first active axis if requested)
  const gridAxis = activeYAxes.find(a => a.showGrid) || activeYAxes[0];
  if (gridAxis) {
    const range = gridAxis.max - gridAxis.min;
    const step = range / Math.max(2, Math.floor(chartHeight / 30));
    const firstTick = Math.ceil(gridAxis.min / step) * step;
    for (let t = firstTick; t <= gridAxis.max; t += step) {
      const { y } = worldToScreen(0, t, { ...vp, yMin: gridAxis.min, yMax: gridAxis.max });
      svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#f0f0f0" stroke-width="1" />`;
    }
  }

  // X-Ticks Grid
  const xRange = viewportX.max - viewportX.min;
  const xStep = xRange / Math.max(2, Math.floor(chartWidth / 60));
  const firstXTick = Math.ceil(viewportX.min / xStep) * xStep;
  for (let t = firstXTick; t <= viewportX.max; t += xStep) {
    const { x } = worldToScreen(t, 0, vp);
    svg += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="#f0f0f0" stroke-width="1" />`;
  }

  // 3. Draw Series Data
  series.forEach(s => {
    const ds = datasets.find(d => d.id === s.sourceId);
    const axis = yAxes.find(a => a.id === s.yAxisId);
    if (!ds || !axis) return;

    const xIdx = ds.columns.indexOf(s.xColumn);
    const yIdx = ds.columns.indexOf(s.yColumn);
    if (xIdx === -1 || yIdx === -1) return;

    const xData = ds.data[xIdx];
    const yData = ds.data[yIdx];
    const visibleData: { x: number, y: number }[] = [];
    
    for (let i = 0; i < ds.rowCount; i++) {
      if (xData[i] >= viewportX.min && xData[i] <= viewportX.max) {
        visibleData.push({ x: xData[i], y: yData[i] });
      }
    }

    // LTTB sampling for SVG performance
    const sampledData = visibleData.length > 5000 ? lttb(visibleData, 5000) : visibleData;
    const seriesVp = { ...vp, yMin: axis.min, yMax: axis.max };
    const screenPoints = sampledData.map(p => worldToScreen(p.x, p.y, seriesVp));

    // Path
    if (screenPoints.length > 1 && s.lineStyle !== 'none') {
      const pathData = screenPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      let dashArray = '';
      if (s.lineStyle === 'dashed') dashArray = 'stroke-dasharray="8,6"';
      else if (s.lineStyle === 'dotted') dashArray = 'stroke-dasharray="2,4"';
      
      svg += `<path d="${pathData}" fill="none" stroke="${s.lineColor}" stroke-width="1" ${dashArray} />`;
    }

    // Points
    if (s.pointStyle !== 'none') {
      screenPoints.forEach(p => {
        if (s.pointStyle === 'circle') {
          svg += `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${s.pointColor}" />`;
        } else if (s.pointStyle === 'square') {
          svg += `<rect x="${p.x - 2.5}" y="${p.y - 2.5}" width="5" height="5" fill="${s.pointColor}" />`;
        } else if (s.pointStyle === 'cross') {
          svg += `<path d="M ${p.x - 2.5} ${p.y - 2.5} L ${p.x + 2.5} ${p.y + 2.5} M ${p.x + 2.5} ${p.y - 2.5} L ${p.x - 2.5} ${p.y + 2.5}" stroke="${s.pointColor}" stroke-width="1" />`;
        }
      });
    }
  });

  // 4. Draw Axes, Ticks, Labels, and Titles
  // Main Chart Box
  svg += `<rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="#333" stroke-width="2" />`;

  // X Axis Ticks and Labels
  const xPrecision = Math.max(0, -Math.floor(Math.log10(xStep || 1))) + 1;
  for (let t = firstXTick; t <= viewportX.max; t += xStep) {
    const { x } = worldToScreen(t, 0, vp);
    if (x < padding.left || x > width - padding.right) continue;
    svg += `<line x1="${x}" y1="${height - padding.bottom}" x2="${x}" y2="${height - padding.bottom + 6}" stroke="#333" stroke-width="1" />`;
    const label = xMode === 'date' ? formatDate(t, xStep) : t.toFixed(xPrecision);
    svg += `<text x="${x}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="9" fill="#666">${label}</text>`;
  }
  // X Axis Title
  svg += `<text x="${padding.left + chartWidth / 2}" y="${height - 5}" text-anchor="middle" font-size="12" font-weight="bold" fill="#333">${axisTitles.x}</text>`;

  // Y Axes
  activeYAxes.forEach(axis => {
    const isLeft = axis.position === 'left';
    const sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
    const xPos = isLeft ? (padding.left - (sideIdx + 1) * AXIS_WIDTH) : (width - padding.right + sideIdx * AXIS_WIDTH);
    
    const range = axis.max - axis.min;
    const step = range / Math.max(2, Math.floor(chartHeight / 30));
    const firstTick = Math.ceil(axis.min / step) * step;
    const precision = Math.max(0, -Math.floor(Math.log10(step || 1))) + 1;

    // Axis Line
    svg += `<line x1="${xPos + (isLeft ? AXIS_WIDTH : 0)}" y1="${padding.top}" x2="${xPos + (isLeft ? AXIS_WIDTH : 0)}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1" />`;

    // Ticks and Labels
    for (let t = firstTick; t <= axis.max; t += step) {
      const { y } = worldToScreen(0, t, { ...vp, yMin: axis.min, yMax: axis.max });
      svg += `<line x1="${xPos + (isLeft ? AXIS_WIDTH - 5 : 0)}" y1="${y}" x2="${xPos + (isLeft ? AXIS_WIDTH : 5)}" y2="${y}" stroke="#333" stroke-width="1" />`;
      
      const labelX = isLeft ? (xPos + AXIS_WIDTH - 7) : (xPos + 7);
      svg += `<text x="${labelX}" y="${y + 3}" text-anchor="${isLeft ? 'end' : 'start'}" font-size="9" fill="#333">${t.toFixed(precision)}</text>`;
    }

    // Axis Title
    const axisSeries = series.filter(s => s.yAxisId === axis.id);
    const title = axisSeries.map(s => s.name || s.yColumn).join(' / ');
    const titleX = isLeft ? (xPos + 5) : (xPos + AXIS_WIDTH - 5);
    const titleY = padding.top + chartHeight / 2;
    const rotate = isLeft ? -90 : 90;
    
    const estimatedWidth = Math.min(chartHeight, title.length * 6 + 8);
    
    svg += `<g transform="translate(${titleX}, ${titleY}) rotate(${rotate})">`;
    svg += `<rect x="-${estimatedWidth / 2}" y="-8" width="${estimatedWidth}" height="16" fill="rgba(255, 255, 255, 0.8)" rx="2" />`;
    svg += `<text x="0" y="4" text-anchor="middle" font-size="10" font-weight="bold" fill="${axisSeries[0]?.lineColor || '#333'}">${title}</text>`;
    svg += `</g>`;
  });

  svg += `</svg>`;
  return svg;
};

const formatDate = (val: number, step: number) => {
  const d = new Date(val * 1000);
  if (step >= 86400) return d.getDate() + '.' + (d.getMonth() + 1) + '.';
  if (step >= 3600) return d.getHours() + ':00';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

/**
 * exportToPNG (v2.2)
 * Uses the improved exportToSVG to render a pixel-perfect PNG.
 */
export const exportToPNG = async (
  datasets: Dataset[], 
  series: SeriesConfig[], 
  yAxes: YAxisConfig[],
  viewportX: { min: number, max: number },
  axisTitles: { x: string, y: string },
  xMode: 'date' | 'numeric',
  width: number,
  height: number
): Promise<string> => {
  const svgString = exportToSVG(datasets, series, yAxes, viewportX, axisTitles, xMode, width, height);
  
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
};

export const downloadFile = (content: string, fileName: string, contentType: string) => {
  const a = document.createElement('a');
  if (content.startsWith('data:')) {
    a.href = content;
  } else {
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
  }
  a.download = fileName;
  a.click();
};
