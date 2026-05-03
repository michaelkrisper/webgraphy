import React, { useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig, type XAxisConfig } from '../../services/persistence';
import { getColumnIndex } from '../../utils/columns';
import { m4Float32 } from '../../utils/lttb';
import { type XAxisLayout, type YAxisLayout } from './chartTypes';

const VERTEX_SHADER_SOURCE = `
      attribute float a_x;
      attribute float a_y;
      uniform vec2 u_x_scale_offset;
      uniform vec2 u_y_scale_offset;
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;
      uniform float u_dpr;
      uniform bool u_is_screen_space;

      void main() {
        float x, y;
        if (u_is_screen_space) {
          x = a_x;
          y = a_y;
        } else {
          x = a_x * u_x_scale_offset.x + u_x_scale_offset.y;
          y = a_y * u_y_scale_offset.x + u_y_scale_offset.y;
        }
        gl_Position = vec4((x / u_resolution.x * 2.0) - 1.0, 1.0 - (y / u_resolution.y * 2.0), 0, 1);
        gl_PointSize = u_point_size;
      }
`;

const FRAGMENT_SHADER_SOURCE = `
      precision highp float;
      uniform vec4 u_color;
      uniform int u_style;

      void main() {
        if (u_style == 0) {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
        } else if (u_style == 2) {
          vec2 p = gl_PointCoord - 0.5;
          if (abs(p.x - p.y) > 0.1 && abs(p.x + p.y) > 0.1) discard;
        }
        gl_FragColor = u_color;
      }
`;

interface WebGLLocations {
  xLoc: number;
  yLoc: number;
  xScaleOffLoc: WebGLUniformLocation | null;
  yScaleOffLoc: WebGLUniformLocation | null;
  padLoc: WebGLUniformLocation | null;
  resLoc: WebGLUniformLocation | null;
  colorLoc: WebGLUniformLocation | null;
  styleLoc: WebGLUniformLocation | null;
  dprLoc: WebGLUniformLocation | null;
  sizeLoc: WebGLUniformLocation | null;
  screenSpaceLoc: WebGLUniformLocation | null;
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
      dprLoc: gl.getUniformLocation(pg, 'u_dpr'),
      sizeLoc: gl.getUniformLocation(pg, 'u_point_size'),
      screenSpaceLoc: gl.getUniformLocation(pg, 'u_is_screen_space'),
      xLoc: gl.getAttribLocation(pg, 'a_x'),
      yLoc: gl.getAttribLocation(pg, 'a_y'),
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

        // Viewport-aware M4: decimate only the visible raw slice to 2 points/pixel.
        // Single path — no level switching, so zoom is seamless at all scales.
        const pixelBudget = Math.max(500, Math.round(chartWidth * dpr) * 2);

        // Binary-search the visible raw range (±1 for boundary continuity)
        let rawStart = 0, rawEnd = xData.length - 1;
        { let lo = 0, hi = xData.length - 1;
          while (lo <= hi) { const m = (lo + hi) >>> 1; if (xData[m] + xRef <= xAxis.min) { rawStart = m; lo = m + 1; } else hi = m - 1; } }
        { let lo = 0, hi = xData.length - 1;
          while (lo <= hi) { const m = (lo + hi) >>> 1; if (xData[m] + xRef >= xAxis.max) { rawEnd = m; hi = m - 1; } else lo = m + 1; } }
        const sliceStart = Math.max(0, rawStart > 0 ? rawStart - 1 : 0);
        const sliceEnd = Math.min(xData.length - 1, rawEnd < xData.length - 1 ? rawEnd + 1 : rawEnd);
        const sliceLen = sliceEnd - sliceStart + 1;

        // M4-decimate the visible slice; m4Float32 passes through when sliceLen <= pixelBudget
        const sliceX = xData.subarray(sliceStart, sliceEnd + 1);
        const sliceY = yData.subarray(sliceStart, sliceEnd + 1);
        const decimated = sliceLen > pixelBudget
          ? m4Float32(sliceX, xRef, sliceY, colY.refPoint, pixelBudget)
          : null; // use raw slice directly

        const drawCount = decimated ? decimated.x.length : sliceLen;

        // Uniforms: decimated uses absolute coords (refPoint baked in by m4Float32), raw uses relative
        const xScaleVal = (chartWidth * dpr) / xRange;
        const xOffsetVal = decimated
          ? (padding.left * dpr) - xAxis.min * xScaleVal
          : (padding.left * dpr) - (xAxis.min - xRef) * xScaleVal;
        const yScaleVal = (padding.top * dpr - (height - padding.bottom) * dpr) / yRange;
        const yOffsetVal = decimated
          ? ((height - padding.bottom) * dpr) - yAxis.min * yScaleVal
          : ((height - padding.bottom) * dpr) - (yAxis.min - colY.refPoint) * yScaleVal;

        // Upload to a per-series dynamic buffer (STREAM_DRAW — changes every frame when zooming)
        const dynXKey = `dyn-x-${ds.id}-${xIdx}-${yIdx}`;
        const dynYKey = `dyn-y-${ds.id}-${xIdx}-${yIdx}`;
        let xBuffer = buffersRef.current.get(dynXKey);
        if (!xBuffer) { xBuffer = gl.createBuffer()!; buffersRef.current.set(dynXKey, xBuffer); }
        let yBuffer = buffersRef.current.get(dynYKey);
        if (!yBuffer) { yBuffer = gl.createBuffer()!; buffersRef.current.set(dynYKey, yBuffer); }

        gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, decimated ? decimated.x : sliceX, gl.STREAM_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, decimated ? decimated.y : sliceY, gl.STREAM_DRAW);

        const drawStart = 0;

        gl.uniform2f(locs.xScaleOffLoc, xScaleVal, xOffsetVal);
        gl.uniform2f(locs.yScaleOffLoc, yScaleVal, yOffsetVal);

        const isHighlighted = highlightedSeriesId === s.id;

        if (s.lineStyle !== 'none' && drawCount > 1) {
          const c = lineColorRgba;
          gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
          gl.uniform1i(locs.styleLoc, 3);

          gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
          gl.enableVertexAttribArray(locs.xLoc);
          gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, drawStart * 4);

          gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
          gl.enableVertexAttribArray(locs.yLoc);
          gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, drawStart * 4);

          gl.lineWidth(isHighlighted ? 2.5 : 1);
          gl.drawArrays(gl.LINE_STRIP, 0, drawCount);
        }

        if (s.pointStyle !== 'none') {
          const c = pointColorRgba;
          gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
          gl.uniform1f(locs.sizeLoc, (isHighlighted ? 8.0 : 5.0) * dpr);
          const pStyle = s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2;
          gl.uniform1i(locs.styleLoc, pStyle);

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
