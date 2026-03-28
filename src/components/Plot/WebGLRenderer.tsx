import React, { useRef, useEffect } from 'react';
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
 * WebGLRenderer Component (Version 2.2)
 * Optimized rendering with intelligent dashing and conditional point drawing.
 */
export const WebGLRenderer: React.FC<Props> = React.memo(({ datasets, series, yAxes, viewportX, width, height, padding }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());

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

      uniform vec2 u_viewport_x;
      uniform vec2 u_viewport_y;
      uniform vec4 u_padding;
      uniform vec2 u_resolution;

      varying float v_t;
      varying float v_len;

      vec2 toScreen(vec2 worldPos) {
        float nx = (worldPos.x - u_viewport_x.x) / (u_viewport_x.y - u_viewport_x.x);
        float ny = (worldPos.y - u_viewport_y.x) / (u_viewport_y.y - u_viewport_y.x);
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
      uniform int u_point_style; // -1: line, 0: circle, 1: square, 2: cross
      uniform int u_line_style;  // 0: solid, 1: dashed, 2: dotted

      varying float v_t;
      varying float v_len;

      void main() {
        if (u_point_style == -1) { // Line rendering
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
        } else if (u_point_style == 0) { // Circle
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (d > 0.5) discard;
        } else if (u_point_style == 2) { // Cross
          vec2 p = gl_PointCoord - vec2(0.5);
          if (abs(p.x - p.y) > 0.1 && abs(p.x + p.y) > 0.1) discard;
        }
        gl_FragColor = u_color;
      }
    `;

    const program = createProgram(gl, vsSource, fsSource);
    programRef.current = program;

    render();
  }, [datasets, series, yAxes, viewportX, width, height, padding]);

  const render = () => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program) return;

    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(padding.left, padding.bottom, width - padding.left - padding.right, height - padding.top - padding.bottom);

    gl.useProgram(program);

    const xViewLoc = gl.getUniformLocation(program, 'u_viewport_x');
    const yViewLoc = gl.getUniformLocation(program, 'u_viewport_y');
    const padLoc = gl.getUniformLocation(program, 'u_padding');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const colorLoc = gl.getUniformLocation(program, 'u_color');
    const styleLoc = gl.getUniformLocation(program, 'u_point_style');
    const lineStyleLoc = gl.getUniformLocation(program, 'u_line_style');
    
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const otherLoc = gl.getAttribLocation(program, 'a_other');
    const tLoc = gl.getAttribLocation(program, 'a_t');

    gl.uniform2f(xViewLoc, viewportX.min, viewportX.max);
    gl.uniform4f(padLoc, padding.top, padding.right, padding.bottom, padding.left);
    gl.uniform2f(resLoc, width, height);

    series.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      const axis = yAxes.find(a => a.id === s.yAxisId);
      if (!ds || !axis) return;

      const xIdx = ds.columns.indexOf(s.xColumn);
      const yIdx = ds.columns.indexOf(s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;

      gl.uniform2f(yViewLoc, axis.min, axis.max);

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

        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(otherLoc);
        gl.vertexAttribPointer(otherLoc, 2, gl.FLOAT, false, 20, 8);
        gl.enableVertexAttribArray(tLoc);
        gl.vertexAttribPointer(tLoc, 1, gl.FLOAT, false, 20, 16);

        const lineColor = hexToRgba(s.lineColor);
        gl.uniform4f(colorLoc, lineColor[0], lineColor[1], lineColor[2], 1.0);
        gl.uniform1i(styleLoc, -1);
        const lStyle = s.lineStyle === 'solid' ? 0 : s.lineStyle === 'dashed' ? 1 : 2;
        gl.uniform1i(lineStyleLoc, lStyle);
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

      gl.disableVertexAttribArray(otherLoc);
      gl.disableVertexAttribArray(tLoc);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const pointColor = hexToRgba(s.pointColor);
      gl.uniform4f(colorLoc, pointColor[0], pointColor[1], pointColor[2], 1.0);
      
      if (s.pointStyle !== 'none') {
        const pStyle = s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2;
        gl.uniform1i(styleLoc, pStyle);
        gl.drawArrays(gl.POINTS, 0, ds.rowCount);
      }
    });
  };

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
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return program;
}

function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function hexToRgba(hex: string): number[] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}
