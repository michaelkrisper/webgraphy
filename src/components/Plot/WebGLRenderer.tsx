import React, { useRef, useEffect, useState, useMemo } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig, type XAxisConfig } from '../../services/persistence';

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
}

/**
 * WebGLRenderer Component (v0.3.4 - Ultra-Precision Shader)
 */
export const WebGLRenderer: React.FC<Props> = React.memo(({ datasets, series, xAxes, yAxes, width, height, padding }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [glReady, setGlReady] = useState(false);
  const [program, setProgram] = useState<WebGLProgram | null>(null);
  const [locations, setLocations] = useState<WebGLLocations | null>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());
  const segParamsRef = useRef<Map<string, string>>(new Map());

  // Global shared buffer to avoid per-segment array allocations
  // Using module-level variable to persist across renders and components
  const getSharedBuffer = (size: number) => {
    let sharedBuffer = (window as unknown as { __webgraphySharedBuffer: Float32Array }).__webgraphySharedBuffer;
    if (!sharedBuffer || sharedBuffer.length < size) {
      let newSize = sharedBuffer ? (sharedBuffer.length || 1024) : 1024;
      while (newSize < size) newSize *= 2;
      sharedBuffer = new Float32Array(newSize);
      (window as unknown as { __webgraphySharedBuffer: Float32Array }).__webgraphySharedBuffer = sharedBuffer;
    }
    return sharedBuffer;
  };

  // Reactive Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true, alpha: true });
    if (!gl) return;
    glRef.current = gl;

    const vsSource = `
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
        float dx = u_rel_viewport_x.y - u_rel_viewport_x.x;
        float dy = u_rel_viewport_y.y - u_rel_viewport_y.x;
        
        // ⚡ Optimization: Pre-calculating ratio on CPU could be even faster, 
        // but keeping it here for precision-safety while simplifying.
        float nx = (abs(dx) > 1e-7) ? (pos.x - u_rel_viewport_x.x) / dx : 0.5;
        float ny = (abs(dy) > 1e-7) ? (pos.y - u_rel_viewport_y.x) / dy : 0.5;
        
        float chartWidth = u_resolution.x - u_padding.w - u_padding.y;
        float chartHeight = u_resolution.y - u_padding.x - u_padding.z;
        return vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
      }

      void main() {
        vec2 p = toScreen(vec2(a_x, a_y));
        vec2 other = toScreen(a_other);
        v_t = a_t;
        v_len = length(other - p);
        v_dist_start = a_dist_start;
        gl_Position = vec4((p / u_resolution * 2.0) - 1.0, 0, 1);
        gl_PointSize = u_point_size;
      }
    `;

    const fsSource = `
      precision highp float;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;
      uniform vec4 u_color;
      uniform int u_style;
      uniform int u_line_style;
      uniform float u_dpr;

      void main() {
        if (u_style == 0) { // Circle
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = u_color;
        } else if (u_style == 1) { // Square
          gl_FragColor = u_color;
        } else if (u_style == 2) { // Cross
          vec2 p = gl_PointCoord - 0.5;
          if (abs(p.x - p.y) > 0.1 && abs(p.x + p.y) > 0.1) discard;
          gl_FragColor = u_color;
        } else { // Line segment
          if (u_line_style > 0) {
            float dashLen = (u_line_style == 1) ? 8.0 : 2.0;
            float gapLen = (u_line_style == 1) ? 6.0 : 4.0;
            float total = (dashLen + gapLen) * u_dpr;
            float dist = mod(v_dist_start + v_t * v_len, total);
            if (dist > dashLen * u_dpr) discard;
          }
          gl_FragColor = u_color;
        }
      }
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
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

  // ⚡ Bolt Optimization: Pre-calculate series metadata to avoid O(N) array/string operations inside the render loop
  const seriesMetadata = useMemo(() => {
    return series.map(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      const xAxis = xAxes.find(a => a.id === (ds?.xAxisId || 'axis-1'));
      const yAxis = yAxes.find(a => a.id === s.yAxisId);
      if (!ds || !xAxis || !yAxis) return null;

      const findColumn = (name: string) => {
        const idx = ds.columns.indexOf(name);
        if (idx !== -1) return idx;
        return ds.columns.findIndex(c => c.endsWith(`: ${name}`) || c === name);
      };

      const xIdx = findColumn(ds.xAxisColumn);
      const yIdx = findColumn(s.yColumn);

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
      const colX = ds.data[xIdx];
      const colY = ds.data[yIdx];
      if (!colX || !colY) return;

      // 1. Determine Visible Range using binary search on X (assume monotonic)
      const xData = colX.data;
      const xRef = colX.refPoint;
      let startIdx = 0;
      let endIdx = xData.length - 1;

      // Find last point <= xAxis.min (to include segment crossing left boundary)
      let low = 0, high = xData.length - 1;
      startIdx = 0;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + xRef <= xAxis.min) {
          startIdx = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      // Find first point >= xAxis.max (to include segment crossing right boundary)
      low = 0; high = xData.length - 1;
      endIdx = xData.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + xRef >= xAxis.max) {
          endIdx = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      // 2. Prepare point data for the visible range
      const numPoints = endIdx - startIdx + 1;
      const yData = colY.data;

      // Pass Viewport relative to this specific column's reference point
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

      const yBufferKey = `buf-y-${ds.id}-${yIdx}`;
      let yBuffer = buffersRef.current.get(yBufferKey);
      if (!yBuffer) {
        yBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, yData, gl.STATIC_DRAW);
        buffersRef.current.set(yBufferKey, yBuffer);
      }

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
          gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
          gl.enableVertexAttribArray(locs.yLoc);
          gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);

          gl.lineWidth(s.lineWidth * dpr);
          gl.drawArrays(gl.LINE_STRIP, startIdx, numPoints);
        } else {
          const segBufferKey = `seg-${ds.id}-${xIdx}-${yIdx}-dyn`;
          const paramKey = `${xAxis.min}-${xAxis.max}-${yAxis.min}-${yAxis.max}-${chartWidth}-${chartHeight}-${dpr}`;
          let segBuffer = buffersRef.current.get(segBufferKey);
          if (!segBuffer) {
            segBuffer = gl.createBuffer()!;
            buffersRef.current.set(segBufferKey, segBuffer);
          }

          if (segParamsRef.current.get(segBufferKey) !== paramKey) {
            // Per vertex: pos(2) + other(2) + t(1) + dist_start(1) = 6 floats, stride 24
            const reqSize = (numPoints - 1) * 12;
            const sharedArr = getSharedBuffer(reqSize);

            // Compute screen-space cumulative arc length in physical pixels
            const xRange = (xAxis.max - xAxis.min) || 1;
            const yRange = (yAxis.max - yAxis.min) || 1;
            const pChartWidth = chartWidth * dpr;
            const pChartHeight = chartHeight * dpr;
            const dashLen = ((lStyle === 1) ? 8.0 : 2.0) * dpr;
            const gapLen = ((lStyle === 1) ? 6.0 : 4.0) * dpr;
            const period = dashLen + gapLen;

            let cumDist = 0;
            for (let i = 0; i < numPoints - 1; i++) {
              const idxA = startIdx + i;
              const idxB = startIdx + i + 1;
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

          // Use xLoc and yLoc for interleaved buffer too, with correct strides/offsets
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
          gl.lineWidth(s.lineWidth * dpr);
          gl.drawArrays(gl.LINES, 0, (numPoints - 1) * 2);
        }
      }

      if (s.pointStyle !== 'none') {
        const c = pointColorRgba;
        gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
        gl.uniform1f(locs.sizeLoc, 5.0 * dpr);
        const pStyle = s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2;
        gl.uniform1i(locs.styleLoc, pStyle);
        
        gl.disableVertexAttribArray(locs.otherLoc);
        gl.disableVertexAttribArray(locs.tLoc);
        gl.disableVertexAttribArray(locs.distStartLoc);

        gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
        gl.enableVertexAttribArray(locs.xLoc);
        gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
        gl.enableVertexAttribArray(locs.yLoc);
        gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.POINTS, startIdx, numPoints);
      }
    });
    gl.disable(gl.SCISSOR_TEST);
  }, [seriesMetadata, width, height, padding, program, locations, glReady]);

  const dpr = window.devicePixelRatio || 1;
  return <canvas ref={canvasRef} width={width * dpr} height={height * dpr} style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }} />;
});

const hexToRgba = (hex: string): number[] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
};
