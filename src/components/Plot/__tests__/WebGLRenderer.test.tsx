import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { WebGLRenderer } from '../WebGLRenderer';
import React from 'react';
import { secureRandom } from '../../../utils/random';

// Mock WebGL Rendering Context
const createMockWebGLContext = () => {
  const gl = {
    getExtension: vi.fn(),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 1),
    getUniformLocation: vi.fn((pg, name) => name),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    viewport: vi.fn(),
    scissor: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    lineWidth: vi.fn(),
    drawArrays: vi.fn(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    disable: vi.fn(),
    FLOAT: 5126,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    STREAM_DRAW: 35040,
    LINE_STRIP: 3,
    LINES: 1,
    POINTS: 0,
    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    COLOR_BUFFER_BIT: 16384,
    SCISSOR_TEST: 3089
  };
  return gl;
};

describe('WebGLRenderer Downsampling', () => {
  let mockGl: ReturnType<typeof createMockWebGLContext>;

  beforeEach(() => {
    mockGl = createMockWebGLContext();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockGl);
  });

  const baseProps = {
    width: 800,
    height: 600,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  it('renders without downsampling when points <= 50000', () => {
    const xData = new Float32Array(50000).map((_, i) => i);
    const yData = new Float32Array(50000).map((_, i) => secureRandom());

    const props = {
      ...baseProps,
      datasets: [{
        id: 'ds1',
        name: 'DS1',
        xAxisId: 'x1',
        columns: ['X', 'Y'],
        xAxisColumn: 'X',
        data: [
          { data: xData, refPoint: 0, min: 0, max: 49999 },
          { data: yData, refPoint: 0, min: 0, max: 1 }
        ]
      }],
      series: [{
        id: 's1',
        sourceId: 'ds1',
        yColumn: 'Y',
        yAxisId: 'y1',
        lineColor: '#ff0000',
        pointColor: '#00ff00',
        lineWidth: 1,
        lineStyle: 'solid',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 49999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINE_STRIP, 0, 50000);
    unmount();
  });

  it('renders with downsampling when points > 50000 and isInteracting', () => {
    const xData = new Float32Array(100000).map((_, i) => i);
    const yData = new Float32Array(100000).map((_, i) => secureRandom());

    const props = {
      ...baseProps,
      datasets: [{
        id: 'ds1',
        name: 'DS1',
        xAxisId: 'x1',
        columns: ['X', 'Y'],
        xAxisColumn: 'X',
        data: [
          { data: xData, refPoint: 0, min: 0, max: 99999 },
          { data: yData, refPoint: 0, min: 0, max: 1 }
        ]
      }],
      series: [{
        id: 's1',
        sourceId: 'ds1',
        yColumn: 'Y',
        yAxisId: 'y1',
        lineColor: '#ff0000',
        pointColor: '#00ff00',
        lineWidth: 1,
        lineStyle: 'solid',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINE_STRIP, 0, 20000);
    unmount();
  });

  it('renders without downsampling when points > 50000 but not interacting', () => {
    const xData = new Float32Array(100000).map((_, i) => i);
    const yData = new Float32Array(100000).map((_, i) => secureRandom());

    const props = {
      ...baseProps,
      datasets: [{
        id: 'ds1',
        name: 'DS1',
        xAxisId: 'x1',
        columns: ['X', 'Y'],
        xAxisColumn: 'X',
        data: [
          { data: xData, refPoint: 0, min: 0, max: 99999 },
          { data: yData, refPoint: 0, min: 0, max: 1 }
        ]
      }],
      series: [{
        id: 's1',
        sourceId: 'ds1',
        yColumn: 'Y',
        yAxisId: 'y1',
        lineColor: '#ff0000',
        pointColor: '#00ff00',
        lineWidth: 1,
        lineStyle: 'solid',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: false
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINE_STRIP, 0, 100000);
    unmount();
  });

  it('handles dashed lines downsampling appropriately', () => {
    const xData = new Float32Array(100000).map((_, i) => i);
    const yData = new Float32Array(100000).map((_, i) => secureRandom());

    const props = {
      ...baseProps,
      datasets: [{
        id: 'ds1',
        name: 'DS1',
        xAxisId: 'x1',
        columns: ['X', 'Y'],
        xAxisColumn: 'X',
        data: [
          { data: xData, refPoint: 0, min: 0, max: 99999 },
          { data: yData, refPoint: 0, min: 0, max: 1 }
        ]
      }],
      series: [{
        id: 's1',
        sourceId: 'ds1',
        yColumn: 'Y',
        yAxisId: 'y1',
        lineColor: '#ff0000',
        pointColor: '#00ff00',
        lineWidth: 1,
        lineStyle: 'dashed',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    // For dashed lines: gl.drawArrays(gl.LINES, 0, numSegs * 2);
    // Draw step = 5, numPoints = 100000. numSegs = Math.floor((100000 - 1) / 5) = 19999
    // Vertices = 19999 * 2 = 39998
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINES, 0, 39998);
    unmount();
  });

  it('handles point styles downsampling appropriately', () => {
    const xData = new Float32Array(100000).map((_, i) => i);
    const yData = new Float32Array(100000).map((_, i) => secureRandom());

    const props = {
      ...baseProps,
      datasets: [{
        id: 'ds1',
        name: 'DS1',
        xAxisId: 'x1',
        columns: ['X', 'Y'],
        xAxisColumn: 'X',
        data: [
          { data: xData, refPoint: 0, min: 0, max: 99999 },
          { data: yData, refPoint: 0, min: 0, max: 1 }
        ]
      }],
      series: [{
        id: 's1',
        sourceId: 'ds1',
        yColumn: 'Y',
        yAxisId: 'y1',
        lineColor: '#ff0000',
        pointColor: '#00ff00',
        lineWidth: 0,
        lineStyle: 'none',
        pointStyle: 'circle'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    // For point styles, drawArrays uses POINTS
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.POINTS, 0, 20000);
    unmount();
  });
});
