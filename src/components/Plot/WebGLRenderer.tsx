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
 * WebGLRenderer Component (v2.5 - Stable State Init)
 */
export const WebGLRenderer: React.FC<Props> = React.memo(({ datasets, series, yAxes, viewportX, width, height, padding }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [glReady, setGlReady] = useState(false);
  const [program, setProgram] = useState<WebGLProgram | null>(null);
  const [locations, setLocations] = useState<any>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());

  // Initialize WebGL once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true, alpha: true });
    if (!gl) {
      console.error("WebGL not supported");
      return;
    }
    glRef.current = gl;

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_other;
      attribute float a_t;
      uniform vec2 u_viewport_x;
      uniform vec2 u_viewport_y;
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      varying float v_t;
      varying float v_len;
      
      vec2 toScreen(vec2 worldPos) {
        float dx = u_viewport_x.y - u_viewport_x.x;
        float dy = u_viewport_y.y - u_viewport_y.x;
        float nx = (dx > 0.0) ? (worldPos.x - u_viewport_x.x) / dx : 0.5;
        float ny = (dy > 0.0) ? (worldPos.y - u_viewport_y.x) / dy : 0.5;
        float chartWidth = u_resolution.x - u_padding.w - u_padding.y;
        float chartHeight = u_resolution.y - u_padding.x - u_padding.z;
        float px = u_padding.w + nx * chartWidth;
        float py = u_padding.z + ny * chartHeight;
        return vec2(px, py);
      }
      void main() {
        vec2 p = toScreen(a_position);
        vec2 other = toScreen(a_other);
        v_t = a_t;
        v_len = length(other - p);
        gl_Position = vec4((p / u_resolution * 2.0) - 1.0, 0, 1);
        gl_PointSize = 5.0;
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
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (d > 0.5) discard;
        } else if (u_point_style == 2) {
          vec2 p = gl_PointCoord - vec2(0.5);
          if (abs(p.x - p.y) > 0.1 && abs(p.x + p.y) > 0.1) discard;
        }
        gl_FragColor = u_color;
      }
    `;

    const pg = createProgram(gl, vsSource, fsSource);
    if (!pg) return;

    setProgram(pg);
    setLocations({
      xViewLoc: gl.getUniformLocation(pg, 'u_viewport_x'),
      yViewLoc: gl.getUniformLocation(pg, 'u_viewport_y'),
      padLoc: gl.getUniformLocation(pg, 'u_padding'),
      resLoc: gl.getUniformLocation(pg, 'u_resolution'),
      colorLoc: gl.getUniformLocation(pg, 'u_color'),
      styleLoc: gl.getUniformLocation(pg, 'u_point_style'),
      lineStyleLoc: gl.getUniformLocation(pg, 'u_line_style'),
      posLoc: gl.getAttribLocation(pg, 'a_position'),
      otherLoc: gl.getAttribLocation(pg, 'a_other'),
      tLoc: gl.getAttribLocation(pg, 'a_t')
    });
    setGlReady(true);
  }, []);

  // Clear buffers on dataset change
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    buffersRef.current.forEach(buf => gl.deleteBuffer(buf));
    buffersRef.current.clear();
  }, [datasets]);

  // Actual rendering
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !program || !locations || !glReady) return;

    const scissorWidth = Math.max(0, width - padding.left - padding.right);
    const scissorHeight = Math.max(0, height - padding.top - padding.bottom);

    if (scissorWidth <= 0 || scissorHeight <= 0) {
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(padding.left, padding.bottom, scissorWidth, scissorHeight);

    gl.useProgram(program);
    const locs = locations;

    gl.uniform2f(locs.xViewLoc, viewportX.min, viewportX.max);
    gl.uniform4f(locs.padLoc, padding.top, padding.right, padding.bottom, padding.left);
    gl.uniform2f(locs.resLoc, width, height);

    series.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      const axis = yAxes.find(a => a.id === s.yAxisId);
      if (!ds || !axis) return;

      const xIdx = ds.columns.indexOf(s.xColumn);
      const yIdx = ds.columns.indexOf(s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;

      gl.uniform2f(locs.yViewLoc, axis.min, axis.max);

      if (s.lineStyle !== 'none') {
        const lineBufferKey = `line-${ds.id}-${s.xColumn}-${s.yColumn}`;
        let lineBuffer = buffersRef.current.get(lineBufferKey);

        if (!lineBuffer) {
          lineBuffer = gl.createBuffer()!;
          const data = new Float32Array((ds.rowCount - 1) * 2 * 5);
          const xData = ds.data[xIdx];
          const yData = ds.data[yIdx];
          let offset = 0;
          for (let i = 0; i < ds.rowCount - 1; i++) {
            const ax = xData[i], ay = yData[i];
            const bx = xData[i+1], by = yData[i+1];
            data[offset++] = ax; data[offset++] = ay; data[offset++] = bx; data[offset++] = by; data[offset++] = 0;
            data[offset++] = bx; data[offset++] = by; data[offset++] = ax; data[offset++] = ay; data[offset++] = 1;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          buffersRef.current.set(lineBufferKey, lineBuffer);
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        }

        gl.enableVertexAttribArray(locs.posLoc);
        gl.vertexAttribPointer(locs.posLoc, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(locs.otherLoc);
        gl.vertexAttribPointer(locs.otherLoc, 2, gl.FLOAT, false, 20, 8);
        gl.enableVertexAttribArray(locs.tLoc);
        gl.vertexAttribPointer(locs.tLoc, 1, gl.FLOAT, false, 20, 16);

        const lineColor = hexToRgba(s.lineColor);
        gl.uniform4f(locs.colorLoc, lineColor[0], lineColor[1], lineColor[2], 1.0);
        gl.uniform1i(locs.styleLoc, -1);
        const lStyle = s.lineStyle === 'solid' ? 0 : s.lineStyle === 'dashed' ? 1 : 2;
        gl.uniform1i(locs.lineStyleLoc, lStyle);
        gl.lineWidth(1);
        gl.drawArrays(gl.LINES, 0, (ds.rowCount - 1) * 2);
      }

      const pointBufferKey = `points-${ds.id}-${s.xColumn}-${s.yColumn}`;
      let pointBuffer = buffersRef.current.get(pointBufferKey);

      if (!pointBuffer) {
        pointBuffer = gl.createBuffer()!;
        const data = new Float32Array(ds.rowCount * 2);
        const xData = ds.data[xIdx];
        const yData = ds.data[yIdx];
        for (let i = 0; i < ds.rowCount; i++) {
          data[i * 2] = xData[i];
          data[i * 2 + 1] = yData[i];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        buffersRef.current.set(pointBufferKey, pointBuffer);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      }

      gl.disableVertexAttribArray(locs.otherLoc);
      gl.disableVertexAttribArray(locs.tLoc);
      gl.enableVertexAttribArray(locs.posLoc);
      gl.vertexAttribPointer(locs.posLoc, 2, gl.FLOAT, false, 0, 0);

      const pointColor = hexToRgba(s.pointColor);
      gl.uniform4f(locs.colorLoc, pointColor[0], pointColor[1], pointColor[2], 1.0);
      
      if (s.pointStyle !== 'none') {
        const pStyle = s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2;
        gl.uniform1i(locs.styleLoc, pStyle);
        gl.drawArrays(gl.POINTS, 0, ds.rowCount);
      }
    });
  }, [datasets, series, yAxes, viewportX, width, height, padding, program, locations, glReady]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }}
    />
  );
});

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vs = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToRgba(hex: string): number[] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}
