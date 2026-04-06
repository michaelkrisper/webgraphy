import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile, formatDate, exportToSVG, exportToPNG } from '../export';
import type { Dataset, SeriesConfig, YAxisConfig, XAxisConfig } from '../persistence';

describe('exportToSVG', () => {
    const mockDatasets: Dataset[] = [
        {
            id: 'ds1',
            name: 'Dataset 1',
            columns: ['Time', 'Value', 'OtherValue'],
            rowCount: 3,
            xAxisColumn: 'Time',
            xAxisId: 'axis-1',
            data: [
                { data: new Float32Array([0, 1, 2]), bounds: { min: 0, max: 2 }, isFloat64: false, refPoint: 0 },
                { data: new Float32Array([10, 20, 30]), bounds: { min: 10, max: 30 }, isFloat64: false, refPoint: 0 },
                { data: new Float32Array([100, 200, 300]), bounds: { min: 100, max: 300 }, isFloat64: false, refPoint: 0 }
            ]
        }
    ];

    const mockSeries: SeriesConfig[] = [
        { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'circle', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' }
    ];

    const mockYAxes: YAxisConfig[] = [
        { id: 'y1', name: 'Y Axis 1', min: 0, max: 100, position: 'left', color: '#000000', showGrid: true },
        { id: 'y2', name: 'Y Axis 2', min: 0, max: 50, position: 'right', color: '#0000ff', showGrid: false },
        { id: 'y3', name: 'Y Axis 3', min: 0, max: 10, position: 'left', color: '#00ff00', showGrid: false }
    ];

    const mockXAxes: XAxisConfig[] = [
        { id: 'axis-1', name: 'X Axis 1', min: 0, max: 10, showGrid: true, xMode: 'numeric' }
    ];

    it('should generate valid SVG string', () => {
        const svg = exportToSVG(mockDatasets, mockSeries, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svg).toContain('<svg width="800" height="600"');
        expect(svg).toContain('Time');
        expect(svg).toContain('Series 1');
    });

    it('should handle multiple left and right axes', () => {
        const multiLeftSeries: SeriesConfig[] = [
            { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'circle', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' },
            { id: 's2', sourceId: 'ds1', name: 'Series 2', yColumn: 'OtherValue', yAxisId: 'y3', pointStyle: 'circle', pointColor: '#00ff00', lineStyle: 'solid', lineColor: '#00ff00' },
            { id: 's3', sourceId: 'ds1', name: 'Series 3', yColumn: 'OtherValue', yAxisId: 'y2', pointStyle: 'circle', pointColor: '#0000ff', lineStyle: 'solid', lineColor: '#0000ff' }
        ];
        const svg = exportToSVG(mockDatasets, multiLeftSeries, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svg).toContain('Series 1');
        expect(svg).toContain('Series 2');
        expect(svg).toContain('Series 3');
    });

    it('should handle missing dataset or axis', () => {
        const seriesMissingDS: SeriesConfig[] = [
            { id: 's1', sourceId: 'missing', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'circle', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' }
        ];
        const svgMissingDS = exportToSVG(mockDatasets, seriesMissingDS, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgMissingDS).not.toContain('<path d="M');

        const seriesMissingAxis: SeriesConfig[] = [
            { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'Value', yAxisId: 'missing', pointStyle: 'circle', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' }
        ];
        const svgMissingAxis = exportToSVG(mockDatasets, seriesMissingAxis, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgMissingAxis).not.toContain('<path d="M');
    });

    it('should handle missing columns', () => {
         const datasetsMissingCol: Dataset[] = [{
             ...mockDatasets[0],
             xAxisColumn: 'MissingX'
         }];
         const svgMissingCol = exportToSVG(datasetsMissingCol, mockSeries, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgMissingCol).not.toContain('<path d="M');

        const seriesMissingYCol: SeriesConfig[] = [
            { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'MissingY', yAxisId: 'y1', pointStyle: 'circle', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' }
        ];
        const svgMissingYCol = exportToSVG(mockDatasets, seriesMissingYCol, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgMissingYCol).not.toContain('<path d="M');
    });

    it('should resolve columns with prefixes', () => {
        const datasetsWithPrefix: Dataset[] = [
            {
                id: 'ds1',
                name: 'Dataset 1',
                columns: ['A: Time', 'A: Value'],
                rowCount: 3,
                xAxisColumn: 'A: Time',
                xAxisId: 'axis-1',
                data: [
                    { data: new Float32Array([0, 1, 2]), bounds: { min: 0, max: 2 }, isFloat64: false, refPoint: 0 },
                    { data: new Float32Array([10, 20, 30]), bounds: { min: 10, max: 30 }, isFloat64: false, refPoint: 0 }
                ]
            }
        ];
        const svg = exportToSVG(datasetsWithPrefix, mockSeries, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svg).toContain('<path d="M');
    });


    it('should handle different point styles', () => {
        const seriesSquare: SeriesConfig[] = [
            { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'square', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' }
        ];
        const svgSquare = exportToSVG(mockDatasets, seriesSquare, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgSquare).toContain('<rect x="');

        const seriesCross: SeriesConfig[] = [
            { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'cross', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' }
        ];
        const svgCross = exportToSVG(mockDatasets, seriesCross, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgCross).toContain('<path d="M');
    });

    it('should handle different line styles', () => {
         const seriesDashed: SeriesConfig[] = [
            { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'none', pointColor: '#ff0000', lineStyle: 'dashed', lineColor: '#ff0000' }
        ];
        const svgDashed = exportToSVG(mockDatasets, seriesDashed, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgDashed).toContain('stroke-dasharray="8,6"');

        const seriesDotted: SeriesConfig[] = [
            { id: 's1', sourceId: 'ds1', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'none', pointColor: '#ff0000', lineStyle: 'dotted', lineColor: '#ff0000' }
        ];
        const svgDotted = exportToSVG(mockDatasets, seriesDotted, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgDotted).toContain('stroke-dasharray="2,4"');
    });

    it('should format date x-axis', () => {
        const mockXAxesDate: XAxisConfig[] = [
            { id: 'axis-1', name: 'X Axis 1', min: 1672531200, max: 1672617600, showGrid: true, xMode: 'date' }
        ];
        const svgDate = exportToSVG(mockDatasets, mockSeries, mockXAxesDate, mockYAxes, { x: 'Time', y: 'Y Axis' }, 800, 600);
        expect(svgDate).toContain('Time');
    });

    it('should downsample large datasets using lttb', () => {
        const largeDataset: Dataset = {
            id: 'dsLarge',
            name: 'Dataset Large',
            columns: ['Time', 'Value'],
            rowCount: 6000,
            xAxisColumn: 'Time',
            xAxisId: 'axis-1',
            data: [
                { data: new Float32Array(6000).fill(1).map((_, i) => i), bounds: { min: 0, max: 6000 }, isFloat64: false, refPoint: 0 },
                { data: new Float32Array(6000).fill(1).map((_, i) => i * 2), bounds: { min: 0, max: 12000 }, isFloat64: false, refPoint: 0 },
            ]
        };
        const seriesLarge: SeriesConfig[] = [
            { id: 's1', sourceId: 'dsLarge', name: 'Series 1', yColumn: 'Value', yAxisId: 'y1', pointStyle: 'circle', pointColor: '#ff0000', lineStyle: 'solid', lineColor: '#ff0000' }
        ];
        const svgLarge = exportToSVG([largeDataset], seriesLarge, mockXAxes, mockYAxes, { x: 'X Axis', y: 'Y Axis' }, 800, 600);
        expect(svgLarge).toContain('<svg width="800" height="600"');
    });
});

interface MockCtx {
    scale: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    fillStyle: string;
}
interface MockCanvas {
    getContext: ReturnType<typeof vi.fn>;
    width: number;
    height: number;
    toDataURL: ReturnType<typeof vi.fn>;
}

describe('exportToPNG', () => {
    let mockCanvas: MockCanvas;
    let mockCtx: MockCtx;

    beforeEach(() => {
        mockCtx = {
            scale: vi.fn(),
            fillRect: vi.fn(),
            drawImage: vi.fn(),
            fillStyle: ''
        };
        mockCanvas = {
            getContext: vi.fn(() => mockCtx),
            width: 0,
            height: 0,
            toDataURL: vi.fn(() => 'data:image/png;base64,mock')
        };
        vi.stubGlobal('document', {
            createElement: vi.fn((tag) => {
                if (tag === 'canvas') return mockCanvas;
                if (tag === 'a') return { href: '', download: '', click: vi.fn() };
                return {};
            })
        });

        // Mock Image to invoke onload immediately
        class MockImage {
            onload: (() => void) | null = null;
            set src(val: string) {
                if (this.onload) setTimeout(this.onload, 0);
            }
        }
        vi.stubGlobal('Image', MockImage);
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:mock'),
            revokeObjectURL: vi.fn()
        });
        class MockBlob { constructor(public content: unknown[], public options: Record<string, string>) {} }
        vi.stubGlobal('Blob', MockBlob);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('should generate PNG data URL', async () => {
         const mockDatasets: Dataset[] = [];
         const mockSeries: SeriesConfig[] = [];
         const mockXAxes: XAxisConfig[] = [];
         const mockYAxes: YAxisConfig[] = [];

         const result = await exportToPNG(mockDatasets, mockSeries, mockXAxes, mockYAxes, { x: 'X', y: 'Y' }, 800, 600);
         expect(result).toBe('data:image/png;base64,mock');
         expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
         expect(mockCtx.drawImage).toHaveBeenCalled();
         expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
});

describe('downloadFile', () => {
  const mockClick = vi.fn();

  beforeEach(() => {
    const mockAnchor = { href: '', download: '', click: mockClick };
    const documentMock = {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') return mockAnchor;
        if (tag === 'canvas') return {
            getContext: vi.fn(() => ({ scale: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() })),
            toDataURL: vi.fn(() => 'data:image/png;base64,mock')
        }
        return {};
      }),
    };
    vi.stubGlobal('document', documentMock);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock-url'), revokeObjectURL: vi.fn() });
    class MockBlob { constructor(public content: unknown[], public options: Record<string, string>) {} }
    vi.stubGlobal('Blob', MockBlob);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should handle data URLs correctly', () => {
    const content = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    downloadFile(content, 'test.png', 'image/png');

    const mockedCreate = document.createElement as unknown as ReturnType<typeof vi.fn>;
    expect(mockedCreate).toHaveBeenCalledWith('a');
    const a = mockedCreate('a') as { href: string; download: string; click: () => void };
    expect(a.href).toBe(content);
    expect(a.download).toBe('test.png');
    expect(mockClick).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('should handle normal strings using Blob correctly', () => {
    downloadFile('Hello, world!', 'test.txt', 'text/plain');

    const mockedCreate = document.createElement as unknown as ReturnType<typeof vi.fn>;
    expect(mockedCreate).toHaveBeenCalledWith('a');
    expect(URL.createObjectURL).toHaveBeenCalled();
    const a = mockedCreate('a') as { href: string; download: string; click: () => void };
    expect(a.href).toBe('blob:mock-url');
    expect(a.download).toBe('test.txt');
    expect(mockClick).toHaveBeenCalled();
  });
});

describe('formatDate', () => {
  it('formats correctly for daily steps (>= 86400)', () => {
    const date = new Date(2023, 0, 15, 12, 0, 0);
    const val = Math.floor(date.getTime() / 1000);
    expect(formatDate(val, 86400)).toBe('15.1.');
    expect(formatDate(val, 90000)).toBe('15.1.');
  });

  it('formats correctly for hourly steps (>= 3600 but < 86400)', () => {
    const date = new Date(2023, 0, 15, 9, 30, 0);
    const val = Math.floor(date.getTime() / 1000);
    expect(formatDate(val, 3600)).toBe('9:00');
    expect(formatDate(val, 7200)).toBe('9:00');
  });

  it('formats correctly for minute steps (< 3600)', () => {
    const date1 = new Date(2023, 0, 15, 9, 5, 0);
    const val1 = Math.floor(date1.getTime() / 1000);
    expect(formatDate(val1, 60)).toBe('09:05');

    const date2 = new Date(2023, 0, 15, 14, 30, 0);
    const val2 = Math.floor(date2.getTime() / 1000);
    expect(formatDate(val2, 1)).toBe('14:30');
  });
});

describe('exportToSVG edge cases', () => {
    it('should calculate final step based on magnitude correctly', () => {
        const datasets: Dataset[] = [{
            id: 'ds1', name: 'Test', columns: ['X', 'Y'], rowCount: 1, xAxisColumn: 'X', xAxisId: 'axis-1', data: [
                { data: new Float32Array([0]), bounds: { min: 0, max: 0 }, isFloat64: false, refPoint: 0 },
                { data: new Float32Array([0]), bounds: { min: 0, max: 0 }, isFloat64: false, refPoint: 0 }
            ]
        }];
        const series: SeriesConfig[] = [{ id: 's1', sourceId: 'ds1', name: 'S1', yColumn: 'Y', yAxisId: 'y1', pointStyle: 'none', pointColor: '', lineStyle: 'none', lineColor: '' }];
        const xAxes: XAxisConfig[] = [{ id: 'axis-1', name: 'X', min: 0, max: 1, showGrid: true, xMode: 'numeric' }];

        // < 1.5
        const axes1: YAxisConfig[] = [{ id: 'y1', name: 'Y1', min: 0, max: 1.2, position: 'left', color: '', showGrid: true }];
        expect(exportToSVG(datasets, series, xAxes, axes1, { x: 'X', y: 'Y' }, 800, 600)).toContain('svg');

        // < 3
        const axes2: YAxisConfig[] = [{ id: 'y1', name: 'Y1', min: 0, max: 2.5, position: 'left', color: '', showGrid: true }];
        expect(exportToSVG(datasets, series, xAxes, axes2, { x: 'X', y: 'Y' }, 800, 600)).toContain('svg');

        // < 7
        const axes3: YAxisConfig[] = [{ id: 'y1', name: 'Y1', min: 0, max: 6.5, position: 'left', color: '', showGrid: true }];
        expect(exportToSVG(datasets, series, xAxes, axes3, { x: 'X', y: 'Y' }, 800, 600)).toContain('svg');

        // >= 7
        const axes4: YAxisConfig[] = [{ id: 'y1', name: 'Y1', min: 0, max: 8.5, position: 'left', color: '', showGrid: true }];
        expect(exportToSVG(datasets, series, xAxes, axes4, { x: 'X', y: 'Y' }, 800, 600)).toContain('svg');
    });

    it('should handle negative width and height gracefully', () => {
        const datasets: Dataset[] = [];
        const series: SeriesConfig[] = [];
        const xAxes: XAxisConfig[] = [];
        const yAxes: YAxisConfig[] = [];
        const svg = exportToSVG(datasets, series, xAxes, yAxes, { x: 'X', y: 'Y' }, -100, -100);
        expect(svg).toContain('<svg width="-100" height="-100"');
    });

    it('should handle zero width and height gracefully', () => {
        const datasets: Dataset[] = [];
        const series: SeriesConfig[] = [];
        const xAxes: XAxisConfig[] = [];
        const yAxes: YAxisConfig[] = [];
        const svg = exportToSVG(datasets, series, xAxes, yAxes, { x: 'X', y: 'Y' }, 0, 0);
        expect(svg).toContain('<svg width="0" height="0"');
    });
});
