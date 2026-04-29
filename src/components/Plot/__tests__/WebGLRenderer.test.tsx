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

  // lttbThreshold = Math.floor(width * LTTB_THRESHOLD_PER_PX) = Math.floor(800 * 2) = 1600

  it('renders without downsampling when points <= lttbThreshold', () => {
    const xData = new Float32Array(1000).map((_v, i) => i);
    const yData = new Float32Array(1000).map(() => secureRandom());

    const props = {
      ...baseProps,
      datasets: [{
        id: 'ds1',
        name: 'DS1',
        xAxisId: 'x1',
        columns: ['X', 'Y'],
        xAxisColumn: 'X',
        data: [
          { data: xData, refPoint: 0, min: 0, max: 999 },
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
        lineStyle: 'solid',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINE_STRIP, 0, 1000);
    unmount();
  });

  it('renders with downsampling when points > lttbThreshold', () => {
    const xData = new Float32Array(100000).map((_v, i) => i);
    const yData = new Float32Array(100000).map(() => secureRandom());

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
        lineStyle: 'solid',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    // lttbThreshold = floor(800 * 2) = 1600
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINE_STRIP, 0, 1600);
    unmount();
  });

  it('renders with downsampling regardless of isInteracting', () => {
    const xData = new Float32Array(100000).map((_v, i) => i);
    const yData = new Float32Array(100000).map(() => secureRandom());

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
        lineStyle: 'solid',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: false
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    // lttbThreshold = floor(800 * 2) = 1600; isInteracting does not affect threshold
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINE_STRIP, 0, 1600);
    unmount();
  });

  it('handles dashed lines downsampling appropriately', () => {
    const xData = new Float32Array(100000).map((_v, i) => i);
    const yData = new Float32Array(100000).map(() => secureRandom());

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
        lineStyle: 'dashed',
        pointStyle: 'none'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    // lttbThreshold = 1600, drawCount = 1600, numSegs = 1599, vertices = 1599 * 2 = 3198
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.LINES, 0, 3198);
    unmount();
  });

  it('handles point styles downsampling appropriately', () => {
    const xData = new Float32Array(100000).map((_v, i) => i);
    const yData = new Float32Array(100000).map(() => secureRandom());

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
        lineStyle: 'none',
        pointStyle: 'circle'
      }],
      xAxes: [{ id: 'x1', min: 0, max: 99999 }],
      yAxes: [{ id: 'y1', min: 0, max: 1 }],
      isInteracting: true
    };

    const { unmount } = render(<WebGLRenderer {...props} />);

    // lttbThreshold = 1600, drawCount = 1600
    expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.POINTS, 0, 1600);
    unmount();
  });
});
