import { type Dataset, type SeriesConfig } from './persistence';
import { type Viewport, worldToScreen } from '../utils/coords';
import { lttb } from '../utils/lttb';

export const exportToSVG = (
  datasets: Dataset[], 
  series: SeriesConfig[], 
  viewport: Viewport,
  axisTitles: { x: string, y: string }
): string => {
  const { width, height } = viewport;
  const p = viewport.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: white; font-family: sans-serif;">`;
  
  // Background
  svg += `<rect width="100%" height="100%" fill="white" />`;

  // Draw axes and grid would go here... (simplified for now)
  svg += `<rect x="${p.left}" y="${p.top}" width="${width - p.left - p.right}" height="${height - p.top - p.bottom}" fill="none" stroke="#333" stroke-width="2" />`;

  // Process Series
  series.forEach(s => {
    const ds = datasets.find(d => d.id === s.sourceId);
    if (!ds) return;

    const xIdx = ds.columns.indexOf(s.xColumn);
    const yIdx = ds.columns.indexOf(s.yColumn);
    if (xIdx === -1 || yIdx === -1) return;

    const visibleData: { x: number, y: number }[] = [];
    const xData = ds.data[xIdx];
    const yData = ds.data[yIdx];

    for (let i = 0; i < ds.rowCount; i++) {
      if (xData[i] >= viewport.xMin && xData[i] <= viewport.xMax) {
        visibleData.push({ x: xData[i], y: yData[i] });
      }
    }

    const sampledData = lttb(visibleData, 5000);
    const screenPoints = sampledData.map(p => worldToScreen(p.x, p.y, viewport));

    if (screenPoints.length > 1) {
      const pathData = screenPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      svg += `<path d="${pathData}" fill="none" stroke="${s.lineColor}" stroke-width="${s.lineWidth}" />`;
    }

    screenPoints.forEach(p => {
      if (s.pointStyle === 'circle') {
        svg += `<circle cx="${p.x}" cy="${p.y}" r="${s.pointSize}" fill="${s.pointColor}" />`;
      }
    });
  });

  svg += `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-weight="bold">${axisTitles.x}</text>`;
  svg += `</svg>`;
  return svg;
};

export const exportToPNG = async (plotContainer: HTMLElement): Promise<string> => {
  const canvas = document.createElement('canvas');
  const width = plotContainer.clientWidth;
  const height = plotContainer.clientHeight;
  
  // Use high DPI
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // 1. Fill white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // 2. Draw SVG layers (Grid, Axes)
  const svgs = plotContainer.querySelectorAll('svg');
  for (const svg of svgs) {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = resolve;
      img.src = url;
    });
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
  }

  // 3. Draw WebGL Canvas
  const webglCanvas = plotContainer.querySelector('canvas');
  if (webglCanvas) {
    ctx.drawImage(webglCanvas, 0, 0, width, height);
  }

  // 4. Draw DOM Labels (simplified)
  // Converting DOM to Canvas is complex, so we just capture the visual state
  
  return canvas.toDataURL('image/png');
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
