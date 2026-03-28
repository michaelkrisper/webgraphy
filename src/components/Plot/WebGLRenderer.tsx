import React, { useRef, useEffect } from 'react';
import { type Dataset, type SeriesConfig, type YAxisConfig } from '../../services/persistence';
import { type Viewport } from '../../utils/coords';

interface Props {
  datasets: Dataset[];
  series: SeriesConfig[];
  yAxes: YAxisConfig[];
  viewportX: { min: number; max: number };
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

export const WebGLRenderer: React.FC<Props> = ({ datasets, series, yAxes, viewportX, width, height, padding }) => {
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
      uniform vec2 u_viewport_x; // min, max
      uniform vec2 u_viewport_y; // min, max
      uniform vec4 u_padding;    // top, right, bottom, left
      uniform vec2 u_resolution;

      void main() {
        float nx = (a_position.x - u_viewport_x.x) / (u_viewport_x.y - u_viewport_x.x);
        float ny = (a_position.y - u_viewport_y.x) / (u_viewport_y.y - u_viewport_y.x);
        
        float chartWidth = u_resolution.x - u_padding.w - u_padding.y;
        float chartHeight = u_resolution.y - u_padding.x - u_padding.z;
        
        float px = u_padding.w + nx * chartWidth;
        float py = u_padding.z + ny * chartHeight;
        
        vec2 clipSpace = (vec2(px, py) / u_resolution * 2.0) - 1.0;
        gl_Position = vec4(clipSpace, 0, 1);
        gl_PointSize = 3.0;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
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

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(padding.left, padding.bottom, width - padding.left - padding.right, height - padding.top - padding.bottom);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    const xViewLoc = gl.getUniformLocation(program, 'u_viewport_x');
    const yViewLoc = gl.getUniformLocation(program, 'u_viewport_y');
    const padLoc = gl.getUniformLocation(program, 'u_padding');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const colorLoc = gl.getUniformLocation(program, 'u_color');
    const posLoc = gl.getAttribLocation(program, 'a_position');

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

      // Set Y-Axis viewport for THIS series
      gl.uniform2f(yViewLoc, axis.min, axis.max);

      const bufferKey = `${ds.id}-${s.xColumn}-${s.yColumn}`;
      let buffer = buffersRef.current.get(bufferKey);

      if (!buffer) {
        buffer = gl.createBuffer()!;
        const interleaved = new Float32Array(ds.rowCount * 2);
        const xData = ds.data[xIdx];
        const yData = ds.data[yIdx];
        for (let i = 0; i < ds.rowCount; i++) {
          interleaved[i * 2] = xData[i];
          interleaved[i * 2 + 1] = yData[i];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
        buffersRef.current.set(bufferKey, buffer);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      }

      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const lineColor = hexToRgba(s.lineColor);
      gl.uniform4f(colorLoc, lineColor[0], lineColor[1], lineColor[2], 1.0);
      gl.lineWidth(s.lineWidth);
      gl.drawArrays(gl.LINE_STRIP, 0, ds.rowCount);

      const pointColor = hexToRgba(s.pointColor);
      gl.uniform4f(colorLoc, pointColor[0], pointColor[1], pointColor[2], 1.0);
      gl.drawArrays(gl.POINTS, 0, ds.rowCount);
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
