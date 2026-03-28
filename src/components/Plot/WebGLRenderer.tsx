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

export const WebGLRenderer: React.FC<Props> = ({ datasets, series, yAxes, viewportX, width, height, padding }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const lineProgramRef = useRef<WebGLProgram | null>(null);
  const pointProgramRef = useRef<WebGLProgram | null>(null);
  const buffersRef = useRef<Map<string, { line: WebGLBuffer, points: WebGLBuffer, count: number }>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true, alpha: true });
    if (!gl) return;
    glRef.current = gl;

    // 1. Line Shader (Segment based extrusion)
    const vsLine = `
      attribute vec2 a_posA;
      attribute vec2 a_posB;
      attribute vec2 a_uv;

      uniform vec2 u_viewport_x;
      uniform vec2 u_viewport_y;
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_thickness;

      varying vec2 v_screenA;
      varying vec2 v_screenB;
      varying vec2 v_screenPos;

      vec2 toScreen(vec2 worldPos) {
          float xRange = max(1e-6, u_viewport_x.y - u_viewport_x.x);
          float yRange = max(1e-6, u_viewport_y.y - u_viewport_y.x);
          float nx = (worldPos.x - u_viewport_x.x) / xRange;
          float ny = (worldPos.y - u_viewport_y.x) / yRange;
          float chartWidth = max(0.0, u_resolution.x - u_padding.w - u_padding.y);
          float chartHeight = max(0.0, u_resolution.y - u_padding.x - u_padding.z);
          return vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
      }

      void main() {
          v_screenA = toScreen(a_posA);
          v_screenB = toScreen(a_posB);
          
          vec2 dir = v_screenB - v_screenA;
          float len = length(dir);
          vec2 unitDir = (len > 1e-6) ? dir / len : vec2(1.0, 0.0);
          vec2 unitNormal = vec2(-unitDir.y, unitDir.x);
          
          float radius = u_thickness * 0.5 + 1.0; // Extra pixel for AA
          
          // a_uv: x in [-1, 1] (along segment), y in [-1, 1] (across segment)
          // Map x=-1 to screenA - radius*unitDir, x=1 to screenB + radius*unitDir
          // Map y=-1 to -radius*unitNormal, y=1 to radius*unitNormal
          
          vec2 base = (a_uv.x < 0.0) ? v_screenA : v_screenB;
          vec2 pos = base + unitDir * a_uv.x * radius + unitNormal * a_uv.y * radius;
          
          v_screenPos = pos;
          gl_Position = vec4((pos / u_resolution * 2.0) - 1.0, 0, 1);
      }
    `;

    const fsLine = `
      precision mediump float;
      uniform vec4 u_color;
      uniform float u_thickness;

      varying vec2 v_screenA;
      varying vec2 v_screenB;
      varying vec2 v_screenPos;

      void main() {
          vec2 P = v_screenPos;
          vec2 A = v_screenA;
          vec2 B = v_screenB;
          
          vec2 AB = B - A;
          float lenSq = max(dot(AB, AB), 1e-6);
          float t = clamp(dot(P - A, AB) / lenSq, 0.0, 1.0);
          vec2 projection = A + AB * t;
          float d = length(P - projection);
          
          float alpha = 1.0 - smoothstep(u_thickness * 0.5 - 0.5, u_thickness * 0.5 + 0.5, d);
          if (alpha <= 0.0) discard;
          
          gl_FragColor = vec4(u_color.rgb, u_color.a * alpha);
      }
    `;

    const vsPoint = `
      attribute vec2 a_position;
      uniform vec2 u_viewport_x;
      uniform vec2 u_viewport_y;
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;

      void main() {
        float xRange = max(0.000001, u_viewport_x.y - u_viewport_x.x);
        float yRange = max(0.000001, u_viewport_y.y - u_viewport_y.x);
        float nx = (a_position.x - u_viewport_x.x) / xRange;
        float ny = (a_position.y - u_viewport_y.x) / yRange;
        float chartWidth = max(0.0, u_resolution.x - u_padding.w - u_padding.y);
        float chartHeight = max(0.0, u_resolution.y - u_padding.x - u_padding.z);
        vec2 p = vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
        gl_Position = vec4((p / u_resolution * 2.0) - 1.0, 0, 1);
        gl_PointSize = u_point_size;
      }
    `;

    const fsPoint = `
      precision mediump float;
      uniform vec4 u_color;
      uniform int u_point_style; 
      uniform bool u_is_point;

      void main() {
        if (u_is_point) {
          // Rounded joints and points
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (u_point_style == 0) { // Circle / Joint
            if (d > 0.5) discard;
          } else if (u_point_style == 1) { // Square
            // No discard needed
          } else if (u_point_style == 2) { // Cross
            vec2 p = gl_PointCoord - vec2(0.5);
            if (abs(p.x - p.y) > 0.1 && abs(p.x + p.y) > 0.1) discard;
          }
        }
        gl_FragColor = u_color;
      }
    `;

    lineProgramRef.current = createProgram(gl, vsLine, fsLine);
    pointProgramRef.current = createProgram(gl, vsPoint, fsPoint);

    render();
  }, [datasets, series, yAxes, viewportX, width, height, padding]);

  const render = () => {
    const gl = glRef.current;
    if (!gl || width <= 0 || height <= 0) return;

    const scissorWidth = Math.max(0, width - padding.left - padding.right);
    const scissorHeight = Math.max(0, height - padding.top - padding.bottom);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.floor(padding.left), Math.floor(padding.bottom), Math.ceil(scissorWidth), Math.ceil(scissorHeight));
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    series.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      const axis = yAxes.find(a => a.id === s.yAxisId);
      if (!ds || !axis) return;

      const xIdx = ds.columns.indexOf(s.xColumn);
      const yIdx = ds.columns.indexOf(s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;

      const bufferKey = `${ds.id}-${s.xColumn}-${s.yColumn}`;
      let buffers = buffersRef.current.get(bufferKey);

      if (!buffers) {
        const xData = ds.data[xIdx];
        const yData = ds.data[yIdx];
        
        const lineData = new Float32Array((ds.rowCount - 1) * 6 * 6); // 6 vertices * 6 floats (posA.xy, posB.xy, uv.xy)
        let vIdx = 0;
        for (let i = 0; i < ds.rowCount - 1; i++) {
          const ax = xData[i], ay = yData[i];
          const bx = xData[i+1], by = yData[i+1];
          
          const addVertex = (ux: number, uy: number) => {
            lineData[vIdx++] = ax; lineData[vIdx++] = ay;
            lineData[vIdx++] = bx; lineData[vIdx++] = by;
            lineData[vIdx++] = ux; lineData[vIdx++] = uy;
          };

          // Triangle 1
          addVertex(-1, -1); addVertex(1, -1); addVertex(-1, 1);
          // Triangle 2
          addVertex(-1, 1); addVertex(1, -1); addVertex(1, 1);
        }

        const lineBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
        gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.STATIC_DRAW);

        const pointData = new Float32Array(ds.rowCount * 2);
        for (let i = 0; i < ds.rowCount; i++) {
          pointData[i * 2] = xData[i];
          pointData[i * 2 + 1] = yData[i];
        }
        const pointBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
        gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.STATIC_DRAW);

        buffers = { line: lineBuf, points: pointBuf, count: ds.rowCount };
        buffersRef.current.set(bufferKey, buffers);
      }

      // 1. DRAW SEGMENTS
      const lProg = lineProgramRef.current!;
      gl.useProgram(lProg);
      gl.uniform2f(gl.getUniformLocation(lProg, 'u_viewport_x'), viewportX.min, viewportX.max);
      gl.uniform2f(gl.getUniformLocation(lProg, 'u_viewport_y'), axis.min, axis.max);
      gl.uniform4f(gl.getUniformLocation(lProg, 'u_padding'), padding.top, padding.right, padding.bottom, padding.left);
      gl.uniform2f(gl.getUniformLocation(lProg, 'u_resolution'), width, height);
      gl.uniform1f(gl.getUniformLocation(lProg, 'u_thickness'), s.lineWidth);
      gl.uniform4f(gl.getUniformLocation(lProg, 'u_color'), ...hexToRgba(s.lineColor), 1.0);
      gl.uniform1i(gl.getUniformLocation(lProg, 'u_is_point'), 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.line);
      const aPosA = gl.getAttribLocation(lProg, 'a_posA');
      const aPosB = gl.getAttribLocation(lProg, 'a_posB');
      const aUV = gl.getAttribLocation(lProg, 'a_uv');
      gl.enableVertexAttribArray(aPosA);
      gl.enableVertexAttribArray(aPosB);
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aPosA, 2, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(aPosB, 2, gl.FLOAT, false, 24, 8);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 24, 16);
      gl.drawArrays(gl.TRIANGLES, 0, (buffers.count - 1) * 6);

      // 2. DRAW ACTUAL DATA POINTS (if style is not circle or size differs)
      if (s.pointStyle !== 'circle' || s.pointSize !== s.lineWidth) {
        const pProg = pointProgramRef.current!;
        gl.useProgram(pProg);
        gl.uniform2f(gl.getUniformLocation(pProg, 'u_viewport_x'), viewportX.min, viewportX.max);
        gl.uniform2f(gl.getUniformLocation(pProg, 'u_viewport_y'), axis.min, axis.max);
        gl.uniform4f(gl.getUniformLocation(pProg, 'u_padding'), padding.top, padding.right, padding.bottom, padding.left);
        gl.uniform2f(gl.getUniformLocation(pProg, 'u_resolution'), width, height);
        gl.uniform1i(gl.getUniformLocation(pProg, 'u_is_point'), 1);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.points);
        const aPointPos = gl.getAttribLocation(pProg, 'a_position');
        gl.enableVertexAttribArray(aPointPos);
        gl.vertexAttribPointer(aPointPos, 2, gl.FLOAT, false, 0, 0);

        gl.uniform1f(gl.getUniformLocation(pProg, 'u_point_size'), s.pointSize);
        gl.uniform1i(gl.getUniformLocation(pProg, 'u_point_style'), s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2);
        gl.uniform4f(gl.getUniformLocation(pProg, 'u_color'), ...hexToRgba(s.pointColor), 1.0);
        gl.drawArrays(gl.POINTS, 0, buffers.count);
      }
    });
  };

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }} />;
};

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
