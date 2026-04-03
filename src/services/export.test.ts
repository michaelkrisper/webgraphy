import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile, exportToSVG } from './export';
import { type Dataset, type SeriesConfig, type YAxisConfig } from './persistence';

describe('export service - downloadFile', () => {
  let createObjectURLMock: any;
  let clickMock: any;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
    vi.stubGlobal('URL', { createObjectURL: createObjectURLMock });

    clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        return { click: clickMock } as any;
      }
      return originalCreateElement(tagName);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should handle regular content by creating a Blob', () => {
    downloadFile('test content', 'test.txt', 'text/plain');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);

    const mockElement = vi.mocked(document.createElement).mock.results[0].value;
    expect(mockElement.href).toBe('blob:http://localhost/test-uuid');
    expect(mockElement.download).toBe('test.txt');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  it('should handle data URLs directly without creating a Blob', () => {
    downloadFile('data:text/plain;base64,dGVzdA==', 'test.txt', 'text/plain');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(createObjectURLMock).not.toHaveBeenCalled();

    const mockElement = vi.mocked(document.createElement).mock.results[0].value;
    expect(mockElement.href).toBe('data:text/plain;base64,dGVzdA==');
    expect(mockElement.download).toBe('test.txt');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });
});

describe('exportToSVG', () => {
  const mockDataset: Dataset = {
    id: 'd1',
    name: 'Test Dataset',
    columns: ['time', 'value'],
    rowCount: 3,
    data: [
      {
        isFloat64: false,
        refPoint: 0,
        bounds: { min: 0, max: 2000 },
        levels: [new Float32Array([0, 1000, 2000])]
      },
      {
        isFloat64: false,
        refPoint: 0,
        bounds: { min: 10, max: 30 },
        levels: [new Float32Array([10, 20, 30])]
      }
    ]
  };

  const mockSeries: SeriesConfig[] = [
    {
      id: 's1',
      sourceId: 'd1',
      name: 'Test Series',
      xColumn: 'time',
      yColumn: 'value',
      yAxisId: 'y1',
      pointStyle: 'circle',
      pointColor: '#ff0000',
      lineStyle: 'solid',
      lineColor: '#00ff00'
    }
  ];

  const mockYAxes: YAxisConfig[] = [
    {
      id: 'y1',
      name: 'Primary Y',
      min: 0,
      max: 100,
      position: 'left',
      color: '#000000',
      showGrid: true
    }
  ];

  const defaultViewport = { min: 0, max: 2000 };
  const defaultAxisTitles = { x: 'Time Axis', y: 'Value Axis' };

  it('should generate a valid SVG wrapper with correct dimensions', () => {
    const svg = exportToSVG(
      [mockDataset], mockSeries, mockYAxes, defaultViewport, defaultAxisTitles, 'numeric', 800, 600
    );

    expect(svg).toContain('<svg width="800" height="600"');
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<rect width="100%" height="100%" fill="white" />');
  });

  it('should render axes lines and grid when enabled', () => {
    const svg = exportToSVG(
      [mockDataset], mockSeries, mockYAxes, defaultViewport, defaultAxisTitles, 'numeric', 800, 600
    );

    expect(svg).toContain('stroke="#f0f0f0"');
    expect(svg).toContain('stroke="#333"');
  });

  it('should render series paths and points', () => {
    const svg = exportToSVG(
      [mockDataset], mockSeries, mockYAxes, defaultViewport, defaultAxisTitles, 'numeric', 800, 600
    );

    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('circle cx=');
    expect(svg).toContain('fill="#ff0000"');
  });

  it('should escape HTML in titles to prevent XSS', () => {
    const maliciousTitles = { x: '<script>alert("x")</script>', y: 'Normal' };
    const maliciousSeries: SeriesConfig[] = [{ ...mockSeries[0], name: '<img src=x onerror=alert(1)>' }];

    const svg = exportToSVG(
      [mockDataset], maliciousSeries, mockYAxes, defaultViewport, maliciousTitles, 'numeric', 800, 600
    );

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;img');
  });

  it('should format date x-axis correctly', () => {
    const svg = exportToSVG(
      [mockDataset], mockSeries, mockYAxes, defaultViewport, defaultAxisTitles, 'date', 800, 600
    );

    expect(svg).toMatch(/<text x="[^"]+" y="[^"]+" text-anchor="middle" font-size="9" fill="#666">[^<]+<\/text>/);
  });
});
