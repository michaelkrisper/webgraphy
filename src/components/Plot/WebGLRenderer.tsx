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
  const [locations, setLocations] = useState<any>(null);
  const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());

  // Reactive Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true, alpha: true });
    if (!gl) return;
    glRef.current = gl;

    const vsSource = `
      attribute vec2 a_position;
      uniform vec2 u_rel_viewport_x; // Already relative to refPoint
      uniform vec2 u_rel_viewport_y; // Already relative to refPoint
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      
      void main() {
        float dx = u_rel_viewport_x.y - u_rel_viewport_x.x;
        float dy = u_rel_viewport_y.y - u_rel_viewport_y.x;
        
        // Final screen position calculation (0 to 1 range)
        float nx = (abs(dx) > 0.000001) ? (a_position.x - u_rel_viewport_x.x) / dx : 0.5;
        float ny = (abs(dy) > 0.000001) ? (a_position.y - u_rel_viewport_y.x) / dy : 0.5;
        
        float chartWidth = u_resolution.x - u_padding.w - u_padding.y;
        float chartHeight = u_resolution.y - u_padding.x - u_padding.z;
        
        vec2 p = vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
        gl_Position = vec4((p / u_resolution * 2.0) - 1.0, 0, 1);
        gl_PointSize = 4.0;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      uniform int u_point_style;
      void main() {
        if (u_point_style == 0) {
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
      xRelLoc: gl.getUniformLocation(pg, 'u_rel_viewport_x'),
      yRelLoc: gl.getUniformLocation(pg, 'u_rel_viewport_y'),
      padLoc: gl.getUniformLocation(pg, 'u_padding'),
      resLoc: gl.getUniformLocation(pg, 'u_resolution'),
      colorLoc: gl.getUniformLocation(pg, 'u_color'),
      styleLoc: gl.getUniformLocation(pg, 'u_point_style'),
      posLoc: gl.getAttribLocation(pg, 'a_position')
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
        const interleavedData = new Float32Array(numPoints * 2);
        for (let i = 0; i < numPoints; i++) {
          interleavedData[i * 2] = xLOD[i];
          interleavedData[i * 2 + 1] = yLOD[i];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, interleavedData, gl.STATIC_DRAW);
        buffersRef.current.set(bufferKey, buffer);
      } else gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

      gl.enableVertexAttribArray(locs.posLoc);
      gl.vertexAttribPointer(locs.posLoc, 2, gl.FLOAT, false, 0, 0);

      if (s.lineStyle !== 'none' && numPoints > 1) {
        const c = hexToRgba(s.lineColor);
        gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
        gl.uniform1i(locs.styleLoc, -1);
        gl.drawArrays(gl.LINE_STRIP, 0, numPoints);
      }

      if (s.pointStyle !== 'none') {
        const c = hexToRgba(s.pointColor);
        gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
        const pStyle = s.pointStyle === 'circle' ? 0 : s.pointStyle === 'square' ? 1 : 2;
        gl.uniform1i(locs.styleLoc, pStyle);
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
