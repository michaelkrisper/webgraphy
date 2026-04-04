import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile, formatDate } from '../export';

describe('downloadFile', () => {
  const mockClick = vi.fn();

  beforeEach(() => {
    const mockAnchor = { href: '', download: '', click: mockClick };
    const documentMock = {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') return mockAnchor;
        return {};
      }),
    };
    vi.stubGlobal('document', documentMock);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock-url') });
    class MockBlob { constructor(public content: any[], public options: any) {} }
    vi.stubGlobal('Blob', MockBlob);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should handle data URLs correctly', () => {
    const content = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    downloadFile(content, 'test.png', 'image/png');

    const doc = document as any;
    expect(doc.createElement).toHaveBeenCalledWith('a');
    const a = doc.createElement('a');
    expect(a.href).toBe(content);
    expect(a.download).toBe('test.png');
    expect(mockClick).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('should handle normal strings using Blob correctly', () => {
    downloadFile('Hello, world!', 'test.txt', 'text/plain');

    const doc = document as any;
    expect(doc.createElement).toHaveBeenCalledWith('a');
    expect(URL.createObjectURL).toHaveBeenCalled();
    const a = doc.createElement('a');
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
