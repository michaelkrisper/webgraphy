import React, { useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig, type XAxisConfig } from '../../services/persistence';
import { getColumnIndex } from '../../utils/columns';
import { m4Float32 } from '../../utils/lttb';
import { type XAxisLayout, type YAxisLayout } from './chartTypes';

const VERTEX_SHADER_SOURCE = `
      // === VERTEX SHADER ===
      attribute float a_x;
      attribute float a_y;
      attribute vec2 a_other;
      attribute float a_t;
      attribute float a_dist_start;
      uniform vec2 u_x_scale_offset; // (scale, offset)
      uniform vec2 u_y_scale_offset; // (scale, offset)
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;
      uniform float u_dpr;
      uniform bool u_is_screen_space;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;

      vec2 toScreen(vec2 pos) {
        float x = pos.x * u_x_scale_offset.x + u_x_scale_offset.y;
        float y = pos.y * u_y_scale_offset.x + u_y_scale_offset.y;
        return vec2(x, y);
      }

      void main() {
        vec2 p;
        if (u_is_screen_space) {
          p = vec2(a_x, a_y); // Already scaled by dpr in the buffer
        } else {
          p = toScreen(vec2(a_x, a_y));
        }
        vec2 other;
        if (u_is_screen_space) {
          other = vec2(a_other.x, a_other.y);
        } else {
          other = toScreen(a_other);
        }
        v_t = a_t;
        v_len = length(other - p);
        v_dist_start = a_dist_start;
        
        // Correctly map screen pixels (0=top, res.y=bottom) to clip space (-1 to 1)
        // x: [0, res.x] -> [-1, 1]  => (x / res.x * 2.0) - 1.0
        // y: [0, res.y] -> [1, -1]  => 1.0 - (y / res.y * 2.0)
        gl_Position = vec4((p.x / u_resolution.x * 2.0) - 1.0, 1.0 - (p.y / u_resolution.y * 2.0), 0, 1);
        gl_PointSize = u_point_size;
      }
`;

const FRAGMENT_SHADER_SOURCE = `
      // === FRAGMENT SHADER ===
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

      void drawSolid() {
        gl_FragColor = u_color;
      }

      void main() {
        if (u_style == 0) {
          drawCircle();
        } else if (u_style == 1) {
          drawSquare();
        } else if (u_style == 2) {
          drawCross();
        } else if (u_style == 3) {
          drawSolid();
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
  xScaleOffLoc: WebGLUniformLocation | null;
  yScaleOffLoc: WebGLUniformLocation | null;
  padLoc: WebGLUniformLocation | null;
  resLoc: WebGLUniformLocation | null;
  colorLoc: WebGLUniformLocation | null;
  styleLoc: WebGLUniformLocation | null;
  lineStyleLoc: WebGLUniformLocation | null;
  dprLoc: WebGLUniformLocation | null;
  sizeLoc: WebGLUniformLocation | null;
  screenSpaceLoc: WebGLUniformLocation | null; // kept for shader compatibility
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
  xAxesLayout?: XAxisLayout[];
  yAxesLayout?: YAxisLayout[];
  plotBg: string;
}

export interface WebGLRendererHandle {
  redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[], xLayout?: XAxisLayout[], yLayout?: YAxisLayout[]) => void;
}

const hexToRgba = (hex: string): number[] => {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return [0, 0, 0];
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b];
  } catch {
    return [0, 0, 0];
  }
};

/**
 * WebGLRenderer Component (v0.5.2 - Optimized Lifecycle & Stable Initialization)
 */
export const WebGLRenderer = React.memo(forwardRef<WebGLRendererHandle, Props>((props, ref) => {
  const {
    datasets, series, xAxes, yAxes, width, height, padding, highlightedSeriesId,
    xAxesLayout, yAxesLayout
  } = props;
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const locationsRef = useRef<WebGLLocations | null>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());
  const segParamsRef = useRef<Map<string, string>>(new Map());
  const lttbCacheRef = useRef<Map<string, { x: Float32Array; y: Float32Array }>>(new Map());
  const liveXAxesRef = useRef<XAxisConfig[]>(xAxes);
  const liveYAxesRef = useRef<YAxisConfig[]>(yAxes);
  const liveXLayoutRef = useRef<XAxisLayout[] | undefined>(xAxesLayout);
  const liveYLayoutRef = useRef<YAxisLayout[] | undefined>(yAxesLayout);
  const drawFrameRef = useRef<((xAxes: XAxisConfig[], yAxes: YAxisConfig[], xLayout?: XAxisLayout[], yLayout?: YAxisLayout[]) => void) | null>(null);

  // Sync props to ref for use in drawFrame without closure issues
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useImperativeHandle(ref, () => ({
    redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[], xLayout?: XAxisLayout[], yLayout?: YAxisLayout[]) => {
      liveXAxesRef.current = xAxes;
      liveYAxesRef.current = yAxes;
      liveXLayoutRef.current = xLayout;
      liveYLayoutRef.current = yLayout;
      drawFrameRef.current?.(xAxes, yAxes, xLayout, yLayout);
    },
  }), []);

  // Synchronous Initialization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { 
      preserveDrawingBuffer: true, 
      antialias: true, 
      alpha: false 
    });
    if (!gl) return;
    glRef.current = gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('VS Error:', gl.getShaderInfoLog(vs));
      return;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER_SOURCE);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('FS Error:', gl.getShaderInfoLog(fs));
      return;
    }

    const pg = gl.createProgram()!;
    gl.attachShader(pg, vs);
    gl.attachShader(pg, fs);
    gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) {
      console.error('Link Error:', gl.getProgramInfoLog(pg));
      return;
    }
    programRef.current = pg;

    locationsRef.current = {
      xScaleOffLoc: gl.getUniformLocation(pg, 'u_x_scale_offset'),
      yScaleOffLoc: gl.getUniformLocation(pg, 'u_y_scale_offset'),
      padLoc: gl.getUniformLocation(pg, 'u_padding'),
      resLoc: gl.getUniformLocation(pg, 'u_resolution'),
      colorLoc: gl.getUniformLocation(pg, 'u_color'),
      styleLoc: gl.getUniformLocation(pg, 'u_style'),
      lineStyleLoc: gl.getUniformLocation(pg, 'u_line_style'),
      dprLoc: gl.getUniformLocation(pg, 'u_dpr'),
      sizeLoc: gl.getUniformLocation(pg, 'u_point_size'),
      screenSpaceLoc: gl.getUniformLocation(pg, 'u_is_screen_space'),
      xLoc: gl.getAttribLocation(pg, 'a_x'),
      yLoc: gl.getAttribLocation(pg, 'a_y'),
      otherLoc: gl.getAttribLocation(pg, 'a_other'),
      tLoc: gl.getAttribLocation(pg, 'a_t'),
      distStartLoc: gl.getAttribLocation(pg, 'a_dist_start')
    };

    // Trigger initial draw
    if (drawFrameRef.current) {
      drawFrameRef.current(liveXAxesRef.current, liveYAxesRef.current, liveXLayoutRef.current, liveYLayoutRef.current);
    }
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    buffersRef.current.forEach(buf => gl.deleteBuffer(buf));
    buffersRef.current.clear();
    segParamsRef.current.clear();
    lttbCacheRef.current.clear();
  }, [datasets]);

  const seriesMetadata = useMemo(() => {
    const datasetsById = new Map<string, Dataset>();
    datasets.forEach(d => datasetsById.set(d.id, d));

    return series.map(s => {
      const ds = datasetsById.get(s.sourceId);
      if (!ds) return null;

      const xIdx = getColumnIndex(ds, ds.xAxisColumn);
      const yIdx = getColumnIndex(ds, s.yColumn);

      if (xIdx === -1 || yIdx === -1) {
        return null;
      }

      return {
        series: s,
        ds,
        xIdx,
        yIdx,
        lineColorRgba: hexToRgba(s.lineColor),
        pointColorRgba: hexToRgba(s.pointColor)
      };
    }).filter(Boolean) as {
      series: SeriesConfig,
      ds: Dataset,
      xIdx: number,
      yIdx: number,
      lineColorRgba: number[],
      pointColorRgba: number[]
    }[];
  }, [datasets, series]);

  useEffect(() => {
    liveXAxesRef.current = xAxes;
    liveYAxesRef.current = yAxes;
    liveXLayoutRef.current = xAxesLayout;
    liveYLayoutRef.current = yAxesLayout;
  }, [xAxes, yAxes, xAxesLayout, yAxesLayout]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !programRef.current || !locationsRef.current) return;

    const drawFrame = (currentXAxes: XAxisConfig[], currentYAxes: YAxisConfig[], _curXLayout?: XAxisLayout[], _curYLayout?: YAxisLayout[]) => {
      const pg = programRef.current;
      const locs = locationsRef.current;
      if (!pg || !locs) return;

      // Use latest props from ref to avoid stale closures
      const {
        width, height, padding, plotBg, highlightedSeriesId,
      } = propsRef.current;

      const xAxesById = new Map<string, XAxisConfig>();
      currentXAxes.forEach(a => xAxesById.set(a.id, a));
      const yAxesById = new Map<string, YAxisConfig>();
      currentYAxes.forEach(a => yAxesById.set(a.id, a));

      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      if (chartWidth <= 0 || chartHeight <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const pw = width * dpr, ph = height * dpr;
      
      const bgRgba = hexToRgba(plotBg || '#000000');
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(bgRgba[0], bgRgba[1], bgRgba[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.useProgram(pg);
      gl.uniform4f(locs.padLoc, padding.top * dpr, padding.right * dpr, padding.bottom * dpr, padding.left * dpr);
      gl.uniform2f(locs.resLoc, pw, ph);
      gl.uniform1f(locs.dprLoc, dpr);

      // Data Rendering (with scissor)
      gl.uniform1i(locs.screenSpaceLoc, 0);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(padding.left * dpr, padding.bottom * dpr, chartWidth * dpr, chartHeight * dpr);

      seriesMetadata.forEach(({ series: s, ds, xIdx, yIdx, lineColorRgba, pointColorRgba }) => {
        const xAxis = xAxesById.get(ds.xAxisId || 'axis-1');
        const yAxis = yAxesById.get(s.yAxisId);
        if (!xAxis || !yAxis) return;

        if (s.hidden) return;
        const colX = ds.data[xIdx];
        const colY = ds.data[yIdx];
        if (!colX || !colY) return;

        const xData = colX.data;
        const yData = colY.data;
        const xRef = colX.refPoint;

        const xRange = xAxis.max - xAxis.min || 1;
        const yRange = yAxis.max - yAxis.min || 1;

        // Single global M4 at 64k points — enough for any screen at any zoom level.
        // Switch to raw only when visible raw count <= M4 threshold (identical result at that point).
        const M4_THRESHOLD = 64000;

        // Binary search raw visible range
        let rawStart = 0, rawEnd = xData.length - 1;
        { let lo = 0, hi = xData.length - 1;
          while (lo <= hi) { const m = (lo + hi) >>> 1; if (xData[m] + xRef <= xAxis.min) { rawStart = m; lo = m + 1; } else hi = m - 1; } }
        { let lo = 0, hi = xData.length - 1;
          while (lo <= hi) { const m = (lo + hi) >>> 1; if (xData[m] + xRef >= xAxis.max) { rawEnd = m; hi = m - 1; } else lo = m + 1; } }
        const numPointsVisible = rawEnd - rawStart + 1;

        // Raw when dataset fits in M4 threshold entirely, or visible slice already small enough.
        // At this crossover m4Float32 returns pass-through (identical to raw), so no visual jump.
        const useRaw = xData.length <= M4_THRESHOLD || numPointsVisible <= M4_THRESHOLD;
        const LTTB_THRESHOLD = M4_THRESHOLD;

        let drawStart: number, drawCount: number;
        let xBuffer: WebGLBuffer, yBuffer: WebGLBuffer;
        let xScaleVal: number, xOffsetVal: number, yScaleVal: number, yOffsetVal: number;

        if (useRaw) {
          // Raw path: use relative Float32Arrays with refPoint in uniforms
          xScaleVal = (chartWidth * dpr) / xRange;
          xOffsetVal = (padding.left * dpr) - (xAxis.min - xRef) * xScaleVal;
          yScaleVal = (padding.top * dpr - (height - padding.bottom) * dpr) / yRange;
          yOffsetVal = ((height - padding.bottom) * dpr) - (yAxis.min - colY.refPoint) * yScaleVal;

          // Aligned start to prevent flicker from boundary shifts
          const alignedStart = Math.max(0, rawStart > 0 ? rawStart - 1 : 0);
          const alignedEnd = Math.min(xData.length - 1, rawEnd < xData.length - 1 ? rawEnd + 1 : rawEnd);
          drawStart = alignedStart;
          drawCount = alignedEnd - alignedStart + 1;

          const xBufferKey = `buf-x-${ds.id}-${xIdx}`;
          let buf = buffersRef.current.get(xBufferKey);
          if (!buf) {
            buf = gl.createBuffer()!;
            buffersRef.current.set(xBufferKey, buf);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, xData, gl.STATIC_DRAW);
          }
          xBuffer = buf;

          const yBufferKey = `buf-y-${ds.id}-${yIdx}`;
          let ybuf = buffersRef.current.get(yBufferKey);
          if (!ybuf) {
            ybuf = gl.createBuffer()!;
            buffersRef.current.set(yBufferKey, ybuf);
            gl.bindBuffer(gl.ARRAY_BUFFER, ybuf);
            gl.bufferData(gl.ARRAY_BUFFER, yData, gl.STATIC_DRAW);
          }
          yBuffer = ybuf;
        } else {
          // LTTB path: absolute-value compact buffers, viewport-stable selection
          xScaleVal = (chartWidth * dpr) / xRange;
          xOffsetVal = (padding.left * dpr) - xAxis.min * xScaleVal;
          yScaleVal = (padding.top * dpr - (height - padding.bottom) * dpr) / yRange;
          yOffsetVal = ((height - padding.bottom) * dpr) - yAxis.min * yScaleVal;

          const lttbKey = `m4-${ds.id}-${xIdx}-${yIdx}-${LTTB_THRESHOLD}`;
          let lttbData = lttbCacheRef.current.get(lttbKey);
          if (!lttbData) {
            lttbData = m4Float32(xData, xRef, yData, colY.refPoint, LTTB_THRESHOLD);
            lttbCacheRef.current.set(lttbKey, lttbData);
          }

          const lttbX = lttbData.x;
          const lttbN = lttbX.length;
          let lttbStart = 0, lttbEnd = lttbN - 1;
          { let lo = 0, hi = lttbN - 1;
            while (lo <= hi) { const m = (lo + hi) >>> 1; if (lttbX[m] <= xAxis.min) { lttbStart = m; lo = m + 1; } else hi = m - 1; } }
          { let lo = 0, hi = lttbN - 1;
            while (lo <= hi) { const m = (lo + hi) >>> 1; if (lttbX[m] >= xAxis.max) { lttbEnd = m; hi = m - 1; } else lo = m + 1; } }
          if (lttbStart > 0) lttbStart--;
          if (lttbEnd < lttbN - 1) lttbEnd++;
          drawStart = lttbStart;
          drawCount = lttbEnd - lttbStart + 1;

          const xBufferKey = `buf-lttb-x-${lttbKey}`;
          let buf = buffersRef.current.get(xBufferKey);
          if (!buf) {
            buf = gl.createBuffer()!;
            buffersRef.current.set(xBufferKey, buf);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, lttbData.x, gl.STATIC_DRAW);
          }
          xBuffer = buf;

          const yBufferKey = `buf-lttb-y-${lttbKey}`;
          let ybuf = buffersRef.current.get(yBufferKey);
          if (!ybuf) {
            ybuf = gl.createBuffer()!;
            buffersRef.current.set(yBufferKey, ybuf);
            gl.bindBuffer(gl.ARRAY_BUFFER, ybuf);
            gl.bufferData(gl.ARRAY_BUFFER, lttbData.y, gl.STATIC_DRAW);
          }
          yBuffer = ybuf;
        }

        gl.uniform2f(locs.xScaleOffLoc, xScaleVal, xOffsetVal);
        gl.uniform2f(locs.yScaleOffLoc, yScaleVal, yOffsetVal);

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
            gl.vertexAttrib2f(locs.otherLoc, 0, 0);
            gl.disableVertexAttribArray(locs.tLoc);
            gl.vertexAttrib1f(locs.tLoc, 0);
            gl.disableVertexAttribArray(locs.distStartLoc);
            gl.vertexAttrib1f(locs.distStartLoc, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
            gl.enableVertexAttribArray(locs.xLoc);
            gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, drawStart * 4);

            gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
            gl.enableVertexAttribArray(locs.yLoc);
            gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, drawStart * 4);

            gl.lineWidth(baseLineWidth);
            gl.drawArrays(gl.LINE_STRIP, 0, drawCount);
          } else {
            // For segment data, get absolute world coords from whichever source is active
            const getSegX = useRaw
              ? (i: number) => xData[i] + xRef
              : (i: number) => lttbCacheRef.current.get(`m4-${ds.id}-${xIdx}-${yIdx}-${LTTB_THRESHOLD}`)!.x[i];
            const getSegY = useRaw
              ? (i: number) => yData[i] + colY.refPoint
              : (i: number) => lttbCacheRef.current.get(`m4-${ds.id}-${xIdx}-${yIdx}-${LTTB_THRESHOLD}`)!.y[i];

            const segBufferKey = `seg-${ds.id}-${xIdx}-${yIdx}-dyn`;
            const paramKey = `${xAxis.min}-${xAxis.max}-${yAxis.min}-${yAxis.max}-${chartWidth}-${chartHeight}-${dpr}-${drawStart}-${drawCount}`;
            let segBuffer = buffersRef.current.get(segBufferKey);
            if (!segBuffer) {
              segBuffer = gl.createBuffer()!;
              buffersRef.current.set(segBufferKey, segBuffer);
            }

            const numSegs = drawCount - 1;
            if (segParamsRef.current.get(segBufferKey) !== paramKey) {
              const reqSize = numSegs * 12;
              const sharedArr = new Float32Array(reqSize);
              const pChartWidth = chartWidth * dpr;
              const pChartHeight = chartHeight * dpr;
              const dashLen = ((lStyle === 1) ? 8.0 : 2.0) * dpr;
              const gapLen = ((lStyle === 1) ? 6.0 : 4.0) * dpr;
              const period = dashLen + gapLen;

              let cumDist = 0;
              for (let i = 0; i < numSegs; i++) {
                const i1 = drawStart + i, i2 = drawStart + i + 1;
                const ax = getSegX(i1), ay = getSegY(i1);
                const bx = getSegX(i2), by = getSegY(i2);
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
              gl.bufferData(gl.ARRAY_BUFFER, sharedArr, gl.STREAM_DRAW);
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

            gl.lineWidth(baseLineWidth);
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
          gl.vertexAttrib2f(locs.otherLoc, 0, 0);
          gl.disableVertexAttribArray(locs.tLoc);
          gl.vertexAttrib1f(locs.tLoc, 0);
          gl.disableVertexAttribArray(locs.distStartLoc);
          gl.vertexAttrib1f(locs.distStartLoc, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
          gl.enableVertexAttribArray(locs.xLoc);
          gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, drawStart * 4);

          gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
          gl.enableVertexAttribArray(locs.yLoc);
          gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, drawStart * 4);

          gl.drawArrays(gl.POINTS, 0, drawCount);
        }
      });
      gl.disable(gl.SCISSOR_TEST);
    };

    drawFrameRef.current = drawFrame;
    drawFrame(liveXAxesRef.current, liveYAxesRef.current, liveXLayoutRef.current, liveYLayoutRef.current);
  }, [seriesMetadata, width, height, padding, highlightedSeriesId]);

  const dpr = window.devicePixelRatio || 1;
  return <canvas ref={canvasRef} width={width * dpr} height={height * dpr} style={{ display: 'block', width: '100%', height: '100%' }} />;
}));
