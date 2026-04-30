import React, { useRef, useEffect, useState, useMemo } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig, type XAxisConfig } from '../../services/persistence';
import { getColumnIndex } from '../../utils/columns';
import { selectLodLevel } from '../../utils/lod';

function stringHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

function lttbCacheHash(dsIdHash: number, xIdx: number, yIdx: number, startIdx: number, endIdx: number, threshold: number): number {
  let h = dsIdHash;
  h = (Math.imul(h ^ xIdx, 0x9e3779b9) >>> 0);
  h = (Math.imul(h ^ yIdx, 0x9e3779b9) >>> 0);
  h = (Math.imul(h ^ startIdx, 0x9e3779b9) >>> 0);
  h = (Math.imul(h ^ endIdx, 0x9e3779b9) >>> 0);
  h = (Math.imul(h ^ threshold, 0x9e3779b9) >>> 0);
  return h;
}

const VERTEX_SHADER_SOURCE = `
      // === VERTEX SHADER ===
      // Transforms world-space data coordinates to screen pixels.
      // Uses segment-based geometry: each line segment is extruded on GPU.
      // Attributes a_t and a_dist_start enable per-vertex dashing calculations.
      attribute float a_x;
      attribute float a_y;
      attribute vec2 a_other;
      attribute float a_t;
      attribute float a_dist_start;
      uniform vec2 u_rel_viewport_x;
      uniform vec2 u_rel_viewport_y;
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;

      vec2 toScreen(vec2 pos) {
        // Convert world space to viewport-relative coordinates [0, 1]
        // Then scale to screen space, accounting for padding
        float dx = u_rel_viewport_x.y - u_rel_viewport_x.x;
        float dy = u_rel_viewport_y.y - u_rel_viewport_y.x;

        // Guard against zero-width viewports (avoid division by zero)
        float nx = (abs(dx) > 1e-7) ? (pos.x - u_rel_viewport_x.x) / dx : 0.5;
        float ny = (abs(dy) > 1e-7) ? (pos.y - u_rel_viewport_y.x) / dy : 0.5;
        
        float chartWidth = u_resolution.x - u_padding.w - u_padding.y;
        float chartHeight = u_resolution.y - u_padding.x - u_padding.z;
        // Apply padding offsets and scale to full screen resolution
        return vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
      }

      void main() {
        // Transform both endpoints to screen space for distance calculation
        vec2 p = toScreen(vec2(a_x, a_y));
        vec2 other = toScreen(a_other);
        v_t = a_t;
        // Store segment length for fragment shader line extrusion
        // a_t parameter (0 to 1 along line) enables dashing patterns
        v_len = length(other - p);
        v_dist_start = a_dist_start;
        gl_Position = vec4((p / u_resolution * 2.0) - 1.0, 0, 1);
        // Point size controls circle/point marker dimensions on screen
        gl_PointSize = u_point_size;
      }
`;

const FRAGMENT_SHADER_SOURCE = `
      // === FRAGMENT SHADER ===
      // Renders final pixel color based on shape type (circle, square, cross, line).
      // Uses conditional dispatch via u_style uniform.
      // Dashing (if enabled) is calculated using accumulated distance.
      precision highp float;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;
      uniform vec4 u_color;
      uniform int u_style;
      uniform int u_line_style;
      uniform float u_dpr;

      void drawCircle() {
        // Use distance field: discard pixels outside circle radius (0.5)
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = u_color;
      }

      void drawSquare() {
        // Square: accept all pixels in point region (no distance test)
        gl_FragColor = u_color;
      }

      void drawCross() {
        vec2 p = gl_PointCoord - 0.5;
        // Cross: draw diagonal lines by rejecting pixels outside axes
        if (abs(p.x - p.y) > 0.1 && abs(p.x + p.y) > 0.1) discard;
        gl_FragColor = u_color;
      }

      void drawLineSegment() {
        // Apply dash pattern if enabled (u_line_style: 0=solid, 1=dashed, 2=dotted)
        if (u_line_style > 0) {
          // Calculate dash/gap lengths and total pattern period
          float dashLen = (u_line_style == 1) ? 8.0 : 2.0;
          float gapLen = (u_line_style == 1) ? 6.0 : 4.0;
          float total = (dashLen + gapLen) * u_dpr;
          // Accumulated distance along line determines dash position
          float dist = mod(v_dist_start + v_t * v_len, total);
          // Discard pixels in gap regions (device pixel ratio scales pattern)
          if (dist > dashLen * u_dpr) discard;
        }
        gl_FragColor = u_color;
      }

      void main() {
        // Dispatch to shape renderer based on series style configuration
        if (u_style == 0) {
          drawCircle();
        } else if (u_style == 1) {
          drawSquare();
        } else if (u_style == 2) {
          drawCross();
        } else {
          drawLineSegment();
        }
      }
`;

interface WebGLLocations {
  xLoc: number;
  yLoc: number;
  otherLoc: number;
  tLoc: number;
  distStartLoc: number;
  xRelLoc: WebGLUniformLocation | null;
  yRelLoc: WebGLUniformLocation | null;
  padLoc: WebGLUniformLocation | null;
  resLoc: WebGLUniformLocation | null;
  colorLoc: WebGLUniformLocation | null;
  styleLoc: WebGLUniformLocation | null;
  lineStyleLoc: WebGLUniformLocation | null;
  dprLoc: WebGLUniformLocation | null;
  sizeLoc: WebGLUniformLocation | null;
}

interface Props {
  datasets: Dataset[];
  series: SeriesConfig[];
  xAxes: XAxisConfig[];
  yAxes: YAxisConfig[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  isInteracting?: boolean;
  highlightedSeriesId?: string | null;
}

const hexToRgba = (hex: string): number[] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
};

const LTTB_THRESHOLD_PER_PX = 2;

function lttbFloat32(xData: Float32Array, yData: Float32Array, startIdx: number, endIdx: number, threshold: number): { x: Float32Array; y: Float32Array } {
  const numPoints = endIdx - startIdx + 1;
  if (threshold >= numPoints || threshold <= 2) {
    return { x: xData.subarray(startIdx, endIdx + 1), y: yData.subarray(startIdx, endIdx + 1) };
  }

  const outX = new Float32Array(threshold);
  const outY = new Float32Array(threshold);

  outX[0] = xData[startIdx];
  outY[0] = yData[startIdx];

  const bucketSize = (numPoints - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Centroid of next bucket
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1 + startIdx;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1 + startIdx, endIdx + 1);
    let avgX = 0, avgY = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += xData[j];
      avgY += yData[j];
    }
    const avgLen = nextBucketEnd - nextBucketStart;
    avgX /= avgLen;
    avgY /= avgLen;

    // Find max area point in current bucket
    const bucketStart = Math.floor(i * bucketSize) + 1 + startIdx;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1 + startIdx, endIdx + 1);
    const ax = xData[startIdx + a], ay = yData[startIdx + a];
    let maxArea = -1, maxIdx = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs((ax - avgX) * (yData[j] - ay) - (ax - xData[j]) * (avgY - ay)) * 0.5;
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    outX[i + 1] = xData[maxIdx];
    outY[i + 1] = yData[maxIdx];
    a = maxIdx - startIdx;
  }

  outX[threshold - 1] = xData[endIdx];
  outY[threshold - 1] = yData[endIdx];

  return { x: outX, y: outY };
}

interface LttbCacheEntry {
  xOut: Float32Array;
  yOut: Float32Array;
  key: number;
}

/**
 * WebGLRenderer Component (v0.4.0 - LOD, Visibility, Highlighting & Optimized Buffer Pool)
 */
export const WebGLRenderer: React.FC<Props> = React.memo(({ datasets, series, xAxes, yAxes, width, height, padding, highlightedSeriesId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [glReady, setGlReady] = useState(false);
  const [program, setProgram] = useState<WebGLProgram | null>(null);
  const [locations, setLocations] = useState<WebGLLocations | null>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());
  const segParamsRef = useRef<Map<string, string>>(new Map());
  const sharedBufferRef = useRef<Float32Array | null>(null);
  const lttbCacheRef = useRef<Map<number, LttbCacheEntry>>(new Map());
  const dsIdHashRef = useRef<Map<string, number>>(new Map());

  // Buffer pool to avoid per-frame allocations
  const getSharedBuffer = (size: number) => {
    if (!sharedBufferRef.current || sharedBufferRef.current.length < size) {
      let newSize = sharedBufferRef.current ? (sharedBufferRef.current.length || 1024) : 1024;
      while (newSize < size) newSize *= 2;
      sharedBufferRef.current = new Float32Array(newSize);
    }
    return sharedBufferRef.current;
  };

  // Reactive Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true, alpha: true });
    if (!gl) return;
    glRef.current = gl;


    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER_SOURCE);
    gl.compileShader(fs);

    const pg = gl.createProgram()!;
    gl.attachShader(pg, vs);
    gl.attachShader(pg, fs);
    gl.linkProgram(pg);
    setProgram(pg);

    setLocations({
      xRelLoc: gl.getUniformLocation(pg, 'u_rel_viewport_x'),
      yRelLoc: gl.getUniformLocation(pg, 'u_rel_viewport_y'),
      padLoc: gl.getUniformLocation(pg, 'u_padding'),
      resLoc: gl.getUniformLocation(pg, 'u_resolution'),
      colorLoc: gl.getUniformLocation(pg, 'u_color'),
      styleLoc: gl.getUniformLocation(pg, 'u_style'),
      lineStyleLoc: gl.getUniformLocation(pg, 'u_line_style'),
      dprLoc: gl.getUniformLocation(pg, 'u_dpr'),
      sizeLoc: gl.getUniformLocation(pg, 'u_point_size'),
      xLoc: gl.getAttribLocation(pg, 'a_x'),
      yLoc: gl.getAttribLocation(pg, 'a_y'),
      otherLoc: gl.getAttribLocation(pg, 'a_other'),
      tLoc: gl.getAttribLocation(pg, 'a_t'),
      distStartLoc: gl.getAttribLocation(pg, 'a_dist_start')
    });
    setGlReady(true);
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    buffersRef.current.forEach(buf => gl.deleteBuffer(buf));
    buffersRef.current.clear();
    segParamsRef.current.clear();
    dsIdHashRef.current.clear();
    lttbCacheRef.current.clear();
    datasets.forEach((ds: Dataset) => {
      dsIdHashRef.current.set(ds.id, stringHash(ds.id));
    });
  }, [datasets]);

  const seriesMetadata = useMemo(() => {
    const datasetsById = new Map<string, Dataset>();
    datasets.forEach(d => datasetsById.set(d.id, d));

    const xAxesById = new Map<string, XAxisConfig>();
    xAxes.forEach(a => xAxesById.set(a.id, a));

    const yAxesById = new Map<string, YAxisConfig>();
    yAxes.forEach(a => yAxesById.set(a.id, a));

    return series.map(s => {
      const ds = datasetsById.get(s.sourceId);
      const xAxis = xAxesById.get(ds?.xAxisId || 'axis-1');
      const yAxis = yAxesById.get(s.yAxisId);
      if (!ds || !xAxis || !yAxis) return null;

      const xIdx = getColumnIndex(ds, ds.xAxisColumn);
      const yIdx = getColumnIndex(ds, s.yColumn);

      if (xIdx === -1 || yIdx === -1) {
        return null;
      }

      return { 
        series: s, 
        ds, 
        xAxis, 
        yAxis, 
        xIdx, 
        yIdx,
        lineColorRgba: hexToRgba(s.lineColor),
        pointColorRgba: hexToRgba(s.pointColor)
      };
    }).filter(Boolean) as { 
      series: SeriesConfig, 
      ds: Dataset, 
      xAxis: XAxisConfig, 
      yAxis: YAxisConfig, 
      xIdx: number, 
      yIdx: number,
      lineColorRgba: number[],
      pointColorRgba: number[]
    }[];
  }, [datasets, series, xAxes, yAxes]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !program || !locations || !glReady) return;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    if (chartWidth <= 0 || chartHeight <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const pw = width * dpr, ph = height * dpr;
    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(padding.left * dpr, padding.bottom * dpr, chartWidth * dpr, chartHeight * dpr);
    gl.useProgram(program);

    const locs = locations;
    gl.uniform4f(locs.padLoc, padding.top * dpr, padding.right * dpr, padding.bottom * dpr, padding.left * dpr);
    gl.uniform2f(locs.resLoc, pw, ph);
    gl.uniform1f(locs.dprLoc, dpr);

    seriesMetadata.forEach(({ series: s, ds, xAxis, yAxis, xIdx, yIdx, lineColorRgba, pointColorRgba }) => {
      if (s.hidden) return;
      const colX = ds.data[xIdx];
      const colY = ds.data[yIdx];
      if (!colX || !colY) return;

      const xData = colX.data;
      let yData = colY.data;
      yData = colY.data;
      const xRef = colX.refPoint;
      let startIdx = 0;
      let endIdx = xData.length - 1;

      let low = 0, high = xData.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + xRef <= xAxis.min) {
          startIdx = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      low = 0; high = xData.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + xRef >= xAxis.max) {
          endIdx = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      const numPoints = endIdx - startIdx + 1;
      const lttbThreshold = Math.max(2, Math.floor(chartWidth * LTTB_THRESHOLD_PER_PX));

      let drawX: Float32Array;
      let drawY: Float32Array;
      let drawCount: number;

      const lodLevel = selectLodLevel(colY.lod, lttbThreshold, numPoints, xData.length);

      if (lodLevel !== null) {
        // Binary-search the LOD level's interleaved X values for the visible range
        const lodPoints = lodLevel.length / 2;
        const xRelMin = xAxis.min - colX.refPoint;
        const xRelMax = xAxis.max - colX.refPoint;

        let lodStart = 0;
        let lo = 0, hi = lodPoints - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (lodLevel[mid * 2] <= xRelMin) { lodStart = mid; lo = mid + 1; }
          else hi = mid - 1;
        }

        let lodEnd = lodPoints - 1;
        lo = 0; hi = lodPoints - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (lodLevel[mid * 2] >= xRelMax) { lodEnd = mid; hi = mid - 1; }
          else lo = mid + 1;
        }

        // Deinterleave the visible slice into separate X/Y arrays using shared buffer
        const visibleLodPoints = lodEnd - lodStart + 1;
        const buf = getSharedBuffer(visibleLodPoints * 2);
        const sliceX = buf.subarray(0, visibleLodPoints);
        const sliceY = buf.subarray(visibleLodPoints, visibleLodPoints * 2);
        for (let k = 0; k < visibleLodPoints; k++) {
          sliceX[k] = lodLevel[(lodStart + k) * 2];
          sliceY[k] = lodLevel[(lodStart + k) * 2 + 1];
        }

        drawX = sliceX;
        drawY = sliceY;
        drawCount = visibleLodPoints;
      } else if (numPoints > lttbThreshold) {
        // Fallback: snap-based LTTB for columns without LOD (e.g. formula columns)
        const totalPoints = xData.length;
        const snap = Math.max(1, Math.floor(lttbThreshold / 2));
        const snapStart = Math.max(0, Math.floor(startIdx / snap) * snap);
        const snapEnd = Math.min(totalPoints - 1, Math.ceil(endIdx / snap) * snap);
        const dsHash = dsIdHashRef.current.get(ds.id) ?? stringHash(ds.id);
        const cacheKey = lttbCacheHash(dsHash, xIdx, yIdx, snapStart, snapEnd, lttbThreshold);
        let cached = lttbCacheRef.current.get(cacheKey);
        if (!cached || cached.key !== cacheKey) {
          const result = lttbFloat32(xData, yData, snapStart, snapEnd, lttbThreshold);
          cached = { xOut: result.x, yOut: result.y, key: cacheKey };
          if (lttbCacheRef.current.size >= 200) {
            const keys = lttbCacheRef.current.keys();
            for (let i = 0; i < 100; i++) lttbCacheRef.current.delete(keys.next().value!);
          }
          lttbCacheRef.current.set(cacheKey, cached);
        }
        drawX = cached.xOut;
        drawY = cached.yOut;
        drawCount = lttbThreshold;
      } else {
        drawX = xData.subarray(startIdx, endIdx + 1);
        drawY = yData.subarray(startIdx, endIdx + 1);
        drawCount = numPoints;
      }

      // drawX/drawY are slices of the original Float32Array (relative = value - refPoint),
      // so uniforms stay in the same relative space regardless of LTTB
      gl.uniform2f(locs.xRelLoc, xAxis.min - colX.refPoint, xAxis.max - colX.refPoint);
      gl.uniform2f(locs.yRelLoc, yAxis.min - colY.refPoint, yAxis.max - colY.refPoint);

      const xBufferKey = `buf-x-${ds.id}-${xIdx}`;
      let xBuffer = buffersRef.current.get(xBufferKey);
      if (!xBuffer) {
        xBuffer = gl.createBuffer()!;
        buffersRef.current.set(xBufferKey, xBuffer);
      }

      const yBufferKey = `buf-y-${ds.id}-${yIdx}`;
      let yBuffer = buffersRef.current.get(yBufferKey);
      if (!yBuffer) {
        yBuffer = gl.createBuffer()!;
        buffersRef.current.set(yBufferKey, yBuffer);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, drawX, gl.STREAM_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, drawY, gl.STREAM_DRAW);

      const isHighlighted = highlightedSeriesId === s.id;
      const baseLineWidth = isHighlighted ? 2.5 : 1;

      if (s.lineStyle !== 'none' && drawCount > 1) {
        const c = lineColorRgba;
        gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
        gl.uniform1f(locs.sizeLoc, 4.0 * dpr);
        const lStyle = s.lineStyle === 'solid' ? 0 : s.lineStyle === 'dashed' ? 1 : 2;
        gl.uniform1i(locs.lineStyleLoc, lStyle);
        gl.uniform1i(locs.styleLoc, -1);

        if (lStyle === 0) {
          gl.disableVertexAttribArray(locs.otherLoc);
          gl.disableVertexAttribArray(locs.tLoc);
          gl.disableVertexAttribArray(locs.distStartLoc);

          gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
          gl.enableVertexAttribArray(locs.xLoc);
          gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 4, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
          gl.enableVertexAttribArray(locs.yLoc);
          gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 4, 0);

          gl.lineWidth(baseLineWidth * dpr);
          gl.drawArrays(gl.LINE_STRIP, 0, drawCount);
        } else {
          const segBufferKey = `seg-${ds.id}-${xIdx}-${yIdx}-dyn`;
          const paramKey = `${xAxis.min}-${xAxis.max}-${yAxis.min}-${yAxis.max}-${chartWidth}-${chartHeight}-${dpr}-${drawCount}`;
          let segBuffer = buffersRef.current.get(segBufferKey);
          if (!segBuffer) {
            segBuffer = gl.createBuffer()!;
            buffersRef.current.set(segBufferKey, segBuffer);
          }

          const numSegs = drawCount - 1;
          if (segParamsRef.current.get(segBufferKey) !== paramKey) {
            const reqSize = numSegs * 12;
            const sharedArr = getSharedBuffer(reqSize);
            const xRange = (xAxis.max - xAxis.min) || 1;
            const yRange = (yAxis.max - yAxis.min) || 1;
            const pChartWidth = chartWidth * dpr;
            const pChartHeight = chartHeight * dpr;
            const dashLen = ((lStyle === 1) ? 8.0 : 2.0) * dpr;
            const gapLen = ((lStyle === 1) ? 6.0 : 4.0) * dpr;
            const period = dashLen + gapLen;

            let cumDist = 0;
            for (let i = 0; i < numSegs; i++) {
              const ax = drawX[i], ay = drawY[i], bx = drawX[i + 1], by = drawY[i + 1];
              const screenDx = (bx - ax) / xRange * pChartWidth;
              const screenDy = (by - ay) / yRange * pChartHeight;
              const segScreenLen = Math.sqrt(screenDx * screenDx + screenDy * screenDy);
              const off = i * 12;
              const startDist = cumDist % period;
              sharedArr[off]     = ax; sharedArr[off + 1] = ay; sharedArr[off + 2] = bx; sharedArr[off + 3] = by; sharedArr[off + 4] = 0; sharedArr[off + 5] = startDist;
              sharedArr[off + 6] = bx; sharedArr[off + 7] = by; sharedArr[off + 8] = ax; sharedArr[off + 9] = ay; sharedArr[off + 10] = 1; sharedArr[off + 11] = startDist;
              cumDist += segScreenLen;
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, sharedArr.subarray(0, reqSize), gl.STREAM_DRAW);
            segParamsRef.current.set(segBufferKey, paramKey);
          } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
          }

          gl.enableVertexAttribArray(locs.xLoc);
          gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 24, 0);
          gl.enableVertexAttribArray(locs.yLoc);
          gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 24, 4);
          gl.enableVertexAttribArray(locs.otherLoc);
          gl.vertexAttribPointer(locs.otherLoc, 2, gl.FLOAT, false, 24, 8);
          gl.enableVertexAttribArray(locs.tLoc);
          gl.vertexAttribPointer(locs.tLoc, 1, gl.FLOAT, false, 24, 16);
          gl.enableVertexAttribArray(locs.distStartLoc);
          gl.vertexAttribPointer(locs.distStartLoc, 1, gl.FLOAT, false, 24, 20);

          gl.lineWidth(baseLineWidth * dpr);
          gl.drawArrays(gl.LINES, 0, numSegs * 2);
        }
      }

      if (s.pointStyle !== 'none') {
        const c = pointColorRgba;
        gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
        gl.uniform1f(locs.sizeLoc, (isHighlighted ? 8.0 : 5.0) * dpr);
        const pStyle = s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2;
        gl.uniform1i(locs.styleLoc, pStyle);

        gl.disableVertexAttribArray(locs.otherLoc);
        gl.disableVertexAttribArray(locs.tLoc);
        gl.disableVertexAttribArray(locs.distStartLoc);

        gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
        gl.enableVertexAttribArray(locs.xLoc);
        gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 4, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
        gl.enableVertexAttribArray(locs.yLoc);
        gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 4, 0);

        gl.drawArrays(gl.POINTS, 0, drawCount);
      }
    });
    gl.disable(gl.SCISSOR_TEST);
  }, [seriesMetadata, width, height, padding, program, locations, glReady, highlightedSeriesId]);

  const dpr = window.devicePixelRatio || 1;
  return <canvas ref={canvasRef} width={width * dpr} height={height * dpr} style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }} />;
});
