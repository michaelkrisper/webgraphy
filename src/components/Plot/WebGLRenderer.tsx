import React, { useRef, useEffect, useState } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig } from '../../services/persistence';

interface Props {
  datasets: Dataset[];
  series: SeriesConfig[];
  yAxes: YAxisConfig[];
  viewportX: { min: number; max: number };
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

/**
 * WebGLRenderer Component (v0.3.4 - Ultra-Precision Shader)
 */
export const WebGLRenderer: React.FC<Props> = React.memo(({ datasets, series, yAxes, viewportX, width, height, padding }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [glReady, setGlReady] = useState(false);
  const [program, setProgram] = useState<WebGLProgram | null>(null);
  const [locations, setLocations] = useState<Record<string, any>>({});
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());

  // Global shared buffer to avoid per-segment array allocations
  // Using module-level variable to persist across renders and components
  const getSharedBuffer = (size: number) => {
    let sharedBuffer = (window as unknown as { __webgraphySharedBuffer: Float32Array }).__webgraphySharedBuffer;
    if (!sharedBuffer || sharedBuffer.length < size) {
      let newSize = sharedBuffer ? sharedBuffer.length : 1024;
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
      attribute vec2 a_position;
      attribute vec2 a_other;
      attribute float a_t;
      uniform vec2 u_rel_viewport_x;
      uniform vec2 u_rel_viewport_y;
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;
      varying float v_t;
      varying float v_len;

      vec2 toScreen(vec2 pos) {
        float dx = u_rel_viewport_x.y - u_rel_viewport_x.x;
        float dy = u_rel_viewport_y.y - u_rel_viewport_y.x;
        float nx = (abs(dx) > 0.000001) ? (pos.x - u_rel_viewport_x.x) / dx : 0.5;
        float ny = (abs(dy) > 0.000001) ? (pos.y - u_rel_viewport_y.x) / dy : 0.5;
        float chartWidth = u_resolution.x - u_padding.w - u_padding.y;
        float chartHeight = u_resolution.y - u_padding.x - u_padding.z;
        return vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
      }

      void main() {
        vec2 p = toScreen(a_position);
        vec2 other = toScreen(a_other);
        v_t = a_t;
        v_len = length(other - p);
        gl_Position = vec4((p / u_resolution * 2.0) - 1.0, 0, 1);
        gl_PointSize = u_point_size;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      uniform int u_point_style;
      uniform int u_line_style;
      varying float v_t;
      varying float v_len;
      void main() {
        if (u_point_style == -1) {
          if (u_line_style > 0) {
            float dashLen = (u_line_style == 1) ? 8.0 : 2.0;
            float gapLen = (u_line_style == 1) ? 6.0 : 4.0;
            float period = dashLen + gapLen;
            float numPeriods = floor(v_len / period + 0.5);
            if (numPeriods > 0.0) {
               float adjustedPeriod = v_len / numPeriods;
               float adjustedDash = adjustedPeriod * (dashLen / period);
               float dist = v_t * v_len;
               if (mod(dist + adjustedDash * 0.5, adjustedPeriod) > adjustedDash) discard;
            }
          }
        } else if (u_point_style == 0) {
          // Circle
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (d > 0.5) discard;
        } else if (u_point_style == 2) {
          // 'X' Symbol
          vec2 p = gl_PointCoord - vec2(0.5);
          float d1 = abs(p.x - p.y);
          float d2 = abs(p.x + p.y);
          if (min(d1, d2) > 0.15) discard;
        }
        gl_FragColor = u_color;
      }
    `;

    const pg = createProgram(gl, vsSource, fsSource);
    if (!pg) return;
    setProgram(pg);

    setLocations({
      xRelLoc: gl.getUniformLocation(pg, 'u_rel_viewport_x'),
      yRelLoc: gl.getUniformLocation(pg, 'u_rel_viewport_y'),
      padLoc: gl.getUniformLocation(pg, 'u_padding'),
      resLoc: gl.getUniformLocation(pg, 'u_resolution'),
      colorLoc: gl.getUniformLocation(pg, 'u_color'),
      styleLoc: gl.getUniformLocation(pg, 'u_point_style'),
      lineStyleLoc: gl.getUniformLocation(pg, 'u_line_style'),
      sizeLoc: gl.getUniformLocation(pg, 'u_point_size'),
      posLoc: gl.getAttribLocation(pg, 'a_position'),
      otherLoc: gl.getAttribLocation(pg, 'a_other'),
      tLoc: gl.getAttribLocation(pg, 'a_t')
    });
    setGlReady(true);
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    buffersRef.current.forEach(buf => gl.deleteBuffer(buf));
    buffersRef.current.clear();
  }, [datasets]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !program || !locations || !glReady) return;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    if (chartWidth <= 0 || chartHeight <= 0) return;

    gl.viewport(0, 0, width, height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(padding.left, padding.bottom, chartWidth, chartHeight);
    gl.useProgram(program);
    
    const locs = locations;
    gl.uniform4f(locs.padLoc, padding.top, padding.right, padding.bottom, padding.left);
    gl.uniform2f(locs.resLoc, width, height);

    series.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      const axis = yAxes.find(a => a.id === s.yAxisId);
      if (!ds || !axis) return;

      const findColumn = (name: string) => {
        const idx = ds.columns.indexOf(name);
        if (idx !== -1) return idx;
        // Try fuzzy match (suffix match for prefixed columns)
        return ds.columns.findIndex(c => c.endsWith(`: ${name}`) || c === name);
      };

      const xIdx = findColumn(s.xColumn);
      const yIdx = findColumn(s.yColumn);
      
      if (xIdx === -1 || yIdx === -1) {
        console.warn(`Column not found for series ${s.name}: x=${s.xColumn} (${xIdx}), y=${s.yColumn} (${yIdx})`);
        return;
      }

      const colX = ds.data[xIdx];
      const colY = ds.data[yIdx];
      if (!colX || !colY) return;

      const viewportRangeX = Math.abs(viewportX.max - viewportX.min) || 1;
      const dataRangeX = (colX.bounds.max - colX.bounds.min) || 1;
      const density = (ds.rowCount * (viewportRangeX / dataRangeX)) / (chartWidth || 1);
      
      let lodLevel = 0;
      if (density > 50) lodLevel = 3;
      else if (density > 10) lodLevel = 2;
      else if (density > 2) lodLevel = 1;
      
      lodLevel = Math.min(lodLevel, colX.levels.length - 1, colY.levels.length - 1);
      
      const xLOD = colX.levels[lodLevel];
      const yLOD = colY.levels[lodLevel];
      const numPoints = xLOD.length;

      // Pass Viewport relative to this specific column's reference point
      gl.uniform2f(locs.xRelLoc, viewportX.min - colX.refPoint, viewportX.max - colX.refPoint);
      gl.uniform2f(locs.yRelLoc, axis.min - colY.refPoint, axis.max - colY.refPoint);

      const bufferKey = `buf-${ds.id}-${xIdx}-${yIdx}-lod${lodLevel}`;
      let buffer = buffersRef.current.get(bufferKey);
      if (!buffer) {
        buffer = gl.createBuffer()!;
        const reqSize = numPoints * 2;
        const sharedArr = getSharedBuffer(reqSize);
        for (let i = 0; i < numPoints; i++) {
          sharedArr[i * 2] = xLOD[i];
          sharedArr[i * 2 + 1] = yLOD[i];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, sharedArr.subarray(0, reqSize), gl.STATIC_DRAW);
        buffersRef.current.set(bufferKey, buffer);
      } else gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

      gl.enableVertexAttribArray(locs.posLoc);
      gl.vertexAttribPointer(locs.posLoc, 2, gl.FLOAT, false, 0, 0);

      if (s.lineStyle !== 'none' && numPoints > 1) {
        const c = hexToRgba(s.lineColor);
        gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
        gl.uniform1f(locs.sizeLoc, 4.0);
        const lStyle = s.lineStyle === 'solid' ? 0 : s.lineStyle === 'dashed' ? 1 : 2;
        gl.uniform1i(locs.lineStyleLoc, lStyle);
        gl.uniform1i(locs.styleLoc, -1);

        if (lStyle === 0) {
          // Solid line can use the same interleaved point buffer with LINE_STRIP
          // but we need to disable other attributes
          gl.disableVertexAttribArray(locs.otherLoc);
          gl.disableVertexAttribArray(locs.tLoc);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.vertexAttribPointer(locs.posLoc, 2, gl.FLOAT, false, 8, 0);
          gl.drawArrays(gl.LINE_STRIP, 0, numPoints);
        } else {
          // Dashed/Dotted needs segment buffer
          const segBufferKey = `seg-${ds.id}-${xIdx}-${yIdx}-lod${lodLevel}`;
          let segBuffer = buffersRef.current.get(segBufferKey);
          if (!segBuffer) {
            segBuffer = gl.createBuffer()!;
            // Each segment: 2 points * (pos(2) + other(2) + t(1)) = 10 floats per segment
            const reqSize = (numPoints - 1) * 10;
            const sharedArr = getSharedBuffer(reqSize);
            for (let i = 0; i < numPoints - 1; i++) {
              const ax = xLOD[i], ay = yLOD[i];
              const bx = xLOD[i + 1], by = yLOD[i + 1];
              const off = i * 10;
              // P1
              sharedArr[off] = ax; sharedArr[off + 1] = ay; sharedArr[off + 2] = bx; sharedArr[off + 3] = by; sharedArr[off + 4] = 0;
              // P2
              sharedArr[off + 5] = bx; sharedArr[off + 6] = by; sharedArr[off + 7] = ax; sharedArr[off + 8] = ay; sharedArr[off + 9] = 1;
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, sharedArr.subarray(0, reqSize), gl.STATIC_DRAW);
            buffersRef.current.set(segBufferKey, segBuffer);
          } else gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);

          gl.enableVertexAttribArray(locs.posLoc);
          gl.vertexAttribPointer(locs.posLoc, 2, gl.FLOAT, false, 20, 0);
          gl.enableVertexAttribArray(locs.otherLoc);
          gl.vertexAttribPointer(locs.otherLoc, 2, gl.FLOAT, false, 20, 8);
          gl.enableVertexAttribArray(locs.tLoc);
          gl.vertexAttribPointer(locs.tLoc, 1, gl.FLOAT, false, 20, 16);
          gl.drawArrays(gl.LINES, 0, (numPoints - 1) * 2);
        }
      }

      if (s.pointStyle !== 'none') {
        const c = hexToRgba(s.pointColor);
        gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
        gl.uniform1f(locs.sizeLoc, 5.0);
        const pStyle = s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2;
        gl.uniform1i(locs.styleLoc, pStyle);
        
        // Ensure point rendering uses the correct point buffer and attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(locs.posLoc, 2, gl.FLOAT, false, 8, 0);
        gl.disableVertexAttribArray(locs.otherLoc);
        gl.disableVertexAttribArray(locs.tLoc);
        
        gl.drawArrays(gl.POINTS, 0, numPoints);
      }
    });
    gl.disable(gl.SCISSOR_TEST);
  }, [datasets, series, yAxes, viewportX, width, height, padding, program, locations, glReady]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }} />;
});

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vs = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToRgba(hex: string): number[] {
  // Handle short hex like #333
  if (hex.length === 4) {
    const r = parseInt(hex[1] + hex[1], 16) / 255;
    const g = parseInt(hex[2] + hex[2], 16) / 255;
    const b = parseInt(hex[3] + hex[3], 16) / 255;
    return [r || 0, g || 0, b || 0];
  }
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r || 0, g || 0, b || 0];
}
