import React, { useRef, useEffect, useState, useMemo } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig, type XAxisConfig } from '../../services/persistence';
import { getColumnIndex } from '../../utils/columns';
import { smoothArray } from '../../utils/data-processing';

const smoothedCache = new WeakMap<Float32Array, Float32Array>();

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
      precision highp float;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;
      uniform vec4 u_color;
      uniform int u_style;
      uniform int u_line_style;
      uniform float u_dpr;

      void drawCircle() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = u_color;
      }

      void drawSquare() {
        gl_FragColor = u_color;
      }

      void drawCross() {
        vec2 p = gl_PointCoord - 0.5;
        if (abs(p.x - p.y) > 0.1 && abs(p.x + p.y) > 0.1) discard;
        gl_FragColor = u_color;
      }

      void drawLineSegment() {
        if (u_line_style > 0) {
          float dashLen = (u_line_style == 1) ? 8.0 : 2.0;
          float gapLen = (u_line_style == 1) ? 6.0 : 4.0;
          float total = (dashLen + gapLen) * u_dpr;
          float dist = mod(v_dist_start + v_t * v_len, total);
          if (dist > dashLen * u_dpr) discard;
        }
        gl_FragColor = u_color;
      }

      void main() {
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

/**
 * WebGLRenderer Component (v0.4.0 - LOD, Visibility, Highlighting & Optimized Buffer Pool)
 */
export const WebGLRenderer: React.FC<Props> = React.memo(({ datasets, series, xAxes, yAxes, width, height, padding, isInteracting, highlightedSeriesId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [glReady, setGlReady] = useState(false);
  const [program, setProgram] = useState<WebGLProgram | null>(null);
  const [locations, setLocations] = useState<WebGLLocations | null>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());
  const segParamsRef = useRef<Map<string, string>>(new Map());
  const sharedBufferRef = useRef<Float32Array | null>(null);

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

      if (s.smooth) {
        let smoothed = smoothedCache.get(colY.data);
        if (!smoothed) {
          smoothed = smoothArray(colY.data, 5);
          smoothedCache.set(colY.data, smoothed);
        }
        yData = smoothed;
      }
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

      const drawStep = (isInteracting && numPoints > 50000) ? Math.max(1, Math.floor(numPoints / 20000)) : 1;

      gl.uniform2f(locs.xRelLoc, xAxis.min - colX.refPoint, xAxis.max - colX.refPoint);
      gl.uniform2f(locs.yRelLoc, yAxis.min - colY.refPoint, yAxis.max - colY.refPoint);

      const xBufferKey = `buf-x-${ds.id}-${xIdx}`;
      let xBuffer = buffersRef.current.get(xBufferKey);
      if (!xBuffer) {
        xBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, xData, gl.STATIC_DRAW);
        buffersRef.current.set(xBufferKey, xBuffer);
      }

      const yBufferKey = `buf-y-${ds.id}-${yIdx}${s.smooth ? '-smooth' : ''}`;
      let yBuffer = buffersRef.current.get(yBufferKey);
      if (!yBuffer) {
        yBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, yData, gl.STATIC_DRAW);
        buffersRef.current.set(yBufferKey, yBuffer);
      }

      const isHighlighted = highlightedSeriesId === s.id;
      const baseLineWidth = isHighlighted ? (s.lineWidth + 1.5) : s.lineWidth;

      if (s.lineStyle !== 'none' && numPoints > 1) {
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
            gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, drawStep * 4, startIdx * 4);

            gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
            gl.enableVertexAttribArray(locs.yLoc);
            gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, drawStep * 4, startIdx * 4);

            gl.lineWidth(baseLineWidth * dpr);
            gl.drawArrays(gl.LINE_STRIP, 0, Math.floor(numPoints / drawStep));
        } else {
          const segBufferKey = `seg-${ds.id}-${xIdx}-${yIdx}-dyn`;
          const paramKey = `${xAxis.min}-${xAxis.max}-${yAxis.min}-${yAxis.max}-${chartWidth}-${chartHeight}-${dpr}`;
          let segBuffer = buffersRef.current.get(segBufferKey);
          if (!segBuffer) {
            segBuffer = gl.createBuffer()!;
            buffersRef.current.set(segBufferKey, segBuffer);
          }

          const numSegs = Math.floor((numPoints - 1) / drawStep);
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
              const idxA = startIdx + i * drawStep;
              const idxB = startIdx + (i + 1) * drawStep;
              const ax = xData[idxA], ay = yData[idxA], bx = xData[idxB], by = yData[idxB];
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
        gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, drawStep * 4, startIdx * 4);

        gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
        gl.enableVertexAttribArray(locs.yLoc);
        gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, drawStep * 4, startIdx * 4);

        gl.drawArrays(gl.POINTS, 0, Math.floor(numPoints / drawStep));
      }
    });
    gl.disable(gl.SCISSOR_TEST);
  }, [seriesMetadata, width, height, padding, program, locations, glReady, isInteracting, highlightedSeriesId]);

  const dpr = window.devicePixelRatio || 1;
  return <canvas ref={canvasRef} width={width * dpr} height={height * dpr} style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }} />;
});
