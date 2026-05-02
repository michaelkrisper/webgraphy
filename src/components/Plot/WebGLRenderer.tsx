import React, { useRef, useEffect, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig, type XAxisConfig } from '../../services/persistence';
import { getColumnIndex } from '../../utils/columns';
import { type XAxisLayout, type YAxisLayout, type XAxisMetrics } from './chartTypes';

const VERTEX_SHADER_SOURCE = `
      // === VERTEX SHADER ===
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
      uniform bool u_is_screen_space;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;

      vec2 toScreen(vec2 pos) {
        float dx = u_rel_viewport_x.y - u_rel_viewport_x.x;
        float dy = u_rel_viewport_y.y - u_rel_viewport_y.x;
        float nx = (abs(dx) > 1e-7) ? (pos.x - u_rel_viewport_x.x) / dx : 0.5;
        float ny = (abs(dy) > 1e-7) ? (pos.y - u_rel_viewport_y.x) / dy : 0.5;
        float chartWidth = u_resolution.x - u_padding.w - u_padding.y;
        float chartHeight = u_resolution.y - u_padding.x - u_padding.z;
        return vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
      }

      void main() {
        vec2 p;
        if (u_is_screen_space) {
          p = vec2(a_x, a_y);
        } else {
          p = toScreen(vec2(a_x, a_y));
        }
        vec2 other;
        if (u_is_screen_space) {
          other = a_other;
        } else {
          other = toScreen(a_other);
        }
        v_t = a_t;
        v_len = length(other - p);
        v_dist_start = a_dist_start;
        gl_Position = vec4((p / u_resolution * 2.0) - 1.0, 0, 1);
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
  xRelLoc: WebGLUniformLocation | null;
  yRelLoc: WebGLUniformLocation | null;
  padLoc: WebGLUniformLocation | null;
  resLoc: WebGLUniformLocation | null;
  colorLoc: WebGLUniformLocation | null;
  styleLoc: WebGLUniformLocation | null;
  lineStyleLoc: WebGLUniformLocation | null;
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
  xAxesMetrics?: XAxisMetrics[];
  themeColors?: {
    axisColor: string;
    zeroLineColor: string;
    gridColor: string;
  };
  leftOffsets?: Record<string, number>;
  rightOffsets?: Record<string, number>;
  axisLayout?: Record<string, { total: number; label: number }>;
  showGrid?: boolean;
}

export interface WebGLRendererHandle {
  redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[], xLayout?: XAxisLayout[], yLayout?: YAxisLayout[]) => void;
}

const hexToRgba = (hex: string): number[] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
};

/**
 * WebGLRenderer Component (v0.5.1 - Integrated WebGL Axes & Highlighting, Reordered)
 */
export const WebGLRenderer = React.memo(forwardRef<WebGLRendererHandle, Props>(({ 
  datasets, series, xAxes, yAxes, width, height, padding, highlightedSeriesId, 
  xAxesLayout, yAxesLayout, xAxesMetrics, themeColors, leftOffsets, rightOffsets, axisLayout 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [glReady, setGlReady] = useState(false);
  const [program, setProgram] = useState<WebGLProgram | null>(null);
  const [locations, setLocations] = useState<WebGLLocations | null>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());
  const staticBuffersRef = useRef<{ grid?: WebGLBuffer, lines?: WebGLBuffer, zero?: WebGLBuffer, triangles?: WebGLBuffer }>({});
  const segParamsRef = useRef<Map<string, string>>(new Map());
  const liveXAxesRef = useRef<XAxisConfig[]>(xAxes);
  const liveYAxesRef = useRef<YAxisConfig[]>(yAxes);
  const liveXLayoutRef = useRef<XAxisLayout[] | undefined>(xAxesLayout);
  const liveYLayoutRef = useRef<YAxisLayout[] | undefined>(yAxesLayout);
  const drawFrameRef = useRef<((xAxes: XAxisConfig[], yAxes: YAxisConfig[], xLayout?: XAxisLayout[], yLayout?: YAxisLayout[]) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[], xLayout?: XAxisLayout[], yLayout?: YAxisLayout[]) => {
      liveXAxesRef.current = xAxes;
      liveYAxesRef.current = yAxes;
      liveXLayoutRef.current = xLayout;
      liveYLayoutRef.current = yLayout;
      drawFrameRef.current?.(xAxes, yAxes, xLayout, yLayout);
    },
  }), []);

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
      screenSpaceLoc: gl.getUniformLocation(pg, 'u_is_screen_space'),
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
    if (!gl || !program || !locations || !glReady) return;

    const drawFrame = (currentXAxes: XAxisConfig[], currentYAxes: YAxisConfig[], curXLayout?: XAxisLayout[], curYLayout?: YAxisLayout[]) => {
      const xAxesById = new Map<string, XAxisConfig>();
      currentXAxes.forEach(a => xAxesById.set(a.id, a));
      const yAxesById = new Map<string, YAxisConfig>();
      currentYAxes.forEach(a => yAxesById.set(a.id, a));

      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      if (chartWidth <= 0 || chartHeight <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const pw = width * dpr, ph = height * dpr;
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.useProgram(program);
      const locs = locations;
      gl.uniform4f(locs.padLoc, padding.top * dpr, padding.right * dpr, padding.bottom * dpr, padding.left * dpr);
      gl.uniform2f(locs.resLoc, pw, ph);
      gl.uniform1f(locs.dprLoc, dpr);

      // --- Axis Rendering (Screen Space) - DRAWN FIRST to be behind data ---
      if (curXLayout && curYLayout && themeColors) {
        gl.uniform1i(locs.screenSpaceLoc, 1);
        gl.uniform1i(locs.styleLoc, 3); // Solid style
        gl.uniform1i(locs.lineStyleLoc, 0); // Solid lines

        const axisColor = hexToRgba(themeColors.axisColor);
        const zeroColor = hexToRgba(themeColors.zeroLineColor);
        const gridColor = hexToRgba(themeColors.gridColor);

        const lines: number[] = [];
        const zeroLines: number[] = [];
        const gridLines: number[] = [];
        const triangles: number[] = [];

        const addLine = (x1: number, y1: number, x2: number, y2: number, target: number[]) => {
          target.push(x1 * dpr, (height - y1) * dpr, x2 * dpr, (height - y2) * dpr);
        };

        const addArrow = (x: number, y: number, angle: number, target: number[]) => {
          const size = 6;
          const x1 = 0, y1 = 0;
          const x2 = -size, y2 = -size / 2;
          const x3 = -size, y3 = size / 2;

          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          const rotate = (px: number, py: number) => ({
            x: x + (px * cosA - py * sinA),
            y: y + (px * sinA + py * cosA)
          });

          const p1 = rotate(x1, y1);
          const p2 = rotate(x2, y2);
          const p3 = rotate(x3, y3);

          target.push(p1.x * dpr, (height - p1.y) * dpr, p2.x * dpr, (height - p2.y) * dpr, p3.x * dpr, (height - p3.y) * dpr);
        };

        // Grid Lines
        curXLayout.forEach((axis, idx) => {
          if (idx === 0) { // Only main X axis grid
            axis.ticks.result.forEach(t => {
              const ts = typeof t === 'number' ? t : t.timestamp;
              const normX = (ts - axis.min) / (axis.max - axis.min);
              if (normX >= 0 && normX <= 1) {
                const x = padding.left + normX * chartWidth;
                addLine(x, padding.top, x, height - padding.bottom, gridLines);
              }
            });
          }
        });

        curYLayout.forEach(axis => {
          if (axis.showGrid) {
            axis.ticks.forEach(t => {
              const normY = (t - axis.min) / (axis.max - axis.min);
              if (normY >= 0 && normY <= 1) {
                const y = (height - padding.bottom) - normY * chartHeight;
                addLine(padding.left, y, width - padding.right, y, gridLines);
              }
            });
          }
        });

        // Main Axis Frame
        addLine(padding.left, height - padding.bottom, padding.left, padding.top, lines);
        addLine(padding.left, padding.top, width - padding.right, padding.top, lines);
        addLine(width - padding.right, padding.top, width - padding.right, height - padding.bottom, lines);

        // X Axes
        curXLayout.forEach((axis, idx) => {
          const metrics = xAxesMetrics?.[idx];
          if (!metrics) return;
          const y = height - padding.bottom + metrics.cumulativeOffset;
          addLine(padding.left, y, width - padding.right + 8, y, lines);
          addArrow(width - padding.right + 8, y, 0, triangles);

          axis.ticks.result.forEach(t => {
            const ts = typeof t === 'number' ? t : t.timestamp;
            const normX = (ts - axis.min) / (axis.max - axis.min);
            if (normX >= 0 && normX <= 1) {
              const x = padding.left + normX * chartWidth;
              addLine(x, y, x, y + 6, lines);
            }
          });

          // Zero line
          if (axis.min <= 0 && axis.max >= 0 && idx === 0) {
            const normX = (0 - axis.min) / (axis.max - axis.min);
            const x = padding.left + normX * chartWidth;
            addArrow(x, padding.top - 8, -Math.PI/2, triangles);
            addLine(x, height - padding.bottom, x, padding.top - 8, zeroLines);
          }
        });

        // Y Axes
        curYLayout.forEach(axis => {
          const isLeft = axis.position === 'left';
          const curLeftOffsets = leftOffsets || {};
          const curRightOffsets = rightOffsets || {};
          const curAxisLayout = axisLayout || {};
          const metrics = curAxisLayout[axis.id] || { total: 40 };
          
          let xPos = isLeft ? padding.left - (curLeftOffsets[axis.id] ?? 0) - metrics.total : width - padding.right + (curRightOffsets[axis.id] ?? 0);
          const axisLineX = isLeft ? xPos + metrics.total : xPos;
          
          addLine(axisLineX, height - padding.bottom, axisLineX, padding.top - 8, lines);
          addArrow(axisLineX, padding.top - 8, -Math.PI/2, triangles);

          axis.ticks.forEach(t => {
            const normY = (t - axis.min) / (axis.max - axis.min);
            if (normY >= 0 && normY <= 1) {
              const y = (height - padding.bottom) - normY * chartHeight;
              const x1 = isLeft ? axisLineX - 5 : axisLineX;
              const x2 = isLeft ? axisLineX : axisLineX + 5;
              addLine(x1, y, x2, y, lines);
            }
          });
        });

        const drawBuffer = (data: number[], mode: number, color: number[], size: number = 1, bufferKey: keyof typeof staticBuffersRef.current) => {
          if (data.length === 0) return;
          let buf = staticBuffersRef.current[bufferKey];
          if (!buf) {
            buf = gl.createBuffer()!;
            staticBuffersRef.current[bufferKey] = buf;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STREAM_DRAW);
          
          gl.enableVertexAttribArray(locs.xLoc);
          gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 8, 0);
          gl.enableVertexAttribArray(locs.yLoc);
          gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 8, 4);
          
          gl.disableVertexAttribArray(locs.otherLoc);
          gl.disableVertexAttribArray(locs.tLoc);
          gl.disableVertexAttribArray(locs.distStartLoc);
          
          gl.uniform4f(locs.colorLoc, color[0], color[1], color[2], 1.0);
          gl.lineWidth(size * dpr);
          gl.drawArrays(mode, 0, data.length / 2);
        };

        drawBuffer(gridLines, gl.LINES, gridColor, 1, 'grid');
        drawBuffer(lines, gl.LINES, axisColor, 1, 'lines');
        drawBuffer(zeroLines, gl.LINES, zeroColor, 1, 'zero');
        drawBuffer(triangles, gl.TRIANGLES, axisColor, 1, 'triangles');
      }

      // Data Rendering (with scissor) - DRAWN SECOND to be on top
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
        const drawCount = numPoints;

        gl.uniform2f(locs.xRelLoc, xAxis.min - colX.refPoint, xAxis.max - colX.refPoint);
        gl.uniform2f(locs.yRelLoc, yAxis.min - colY.refPoint, yAxis.max - colY.refPoint);

        const xBufferKey = `buf-x-${ds.id}-${xIdx}`;
        let xBuffer = buffersRef.current.get(xBufferKey);
        if (!xBuffer) {
          xBuffer = gl.createBuffer()!;
          buffersRef.current.set(xBufferKey, xBuffer);
          gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, xData, gl.STATIC_DRAW);
        }

        const yBufferKey = `buf-y-${ds.id}-${yIdx}`;
        let yBuffer = buffersRef.current.get(yBufferKey);
        if (!yBuffer) {
          yBuffer = gl.createBuffer()!;
          buffersRef.current.set(yBufferKey, yBuffer);
          gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, yData, gl.STATIC_DRAW);
        }

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

            gl.lineWidth(baseLineWidth);
            gl.drawArrays(gl.LINE_STRIP, startIdx, drawCount);
          } else {
            const segBufferKey = `seg-${ds.id}-${xIdx}-${yIdx}-dyn`;
            const paramKey = `${xAxis.min}-${xAxis.max}-${yAxis.min}-${yAxis.max}-${chartWidth}-${chartHeight}-${dpr}-${startIdx}-${drawCount}`;
            let segBuffer = buffersRef.current.get(segBufferKey);
            if (!segBuffer) {
              segBuffer = gl.createBuffer()!;
              buffersRef.current.set(segBufferKey, segBuffer);
            }

            const numSegs = drawCount - 1;
            if (segParamsRef.current.get(segBufferKey) !== paramKey) {
              const reqSize = numSegs * 12;
              const sharedArr = new Float32Array(reqSize);
              const xRange = (xAxis.max - xAxis.min) || 1;
              const yRange = (yAxis.max - yAxis.min) || 1;
              const pChartWidth = chartWidth * dpr;
              const pChartHeight = chartHeight * dpr;
              const dashLen = ((lStyle === 1) ? 8.0 : 2.0) * dpr;
              const gapLen = ((lStyle === 1) ? 6.0 : 4.0) * dpr;
              const period = dashLen + gapLen;

              let cumDist = 0;
              for (let i = 0; i < numSegs; i++) {
                const ax = xData[startIdx + i], ay = yData[startIdx + i], bx = xData[startIdx + i + 1], by = yData[startIdx + i + 1];
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
          gl.disableVertexAttribArray(locs.tLoc);
          gl.disableVertexAttribArray(locs.distStartLoc);

          gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
          gl.enableVertexAttribArray(locs.xLoc);
          gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 4, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
          gl.enableVertexAttribArray(locs.yLoc);
          gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 4, 0);

          gl.drawArrays(gl.POINTS, startIdx, drawCount);
        }
      });
      gl.disable(gl.SCISSOR_TEST);
    };

    drawFrameRef.current = drawFrame;
    drawFrame(liveXAxesRef.current, liveYAxesRef.current, liveXLayoutRef.current, liveYLayoutRef.current);
  }, [seriesMetadata, width, height, padding, program, locations, glReady, highlightedSeriesId, themeColors, xAxesMetrics, leftOffsets, rightOffsets, axisLayout]);

  const dpr = window.devicePixelRatio || 1;
  return <canvas ref={canvasRef} width={width * dpr} height={height * dpr} style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }} />;
}));
