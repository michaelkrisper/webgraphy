import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile } from '../export';

describe('downloadFile', () => {
  const mockClick = vi.fn();
  let originalCreateElement: typeof document.createElement;
  let originalCreateObjectURL: typeof URL.createObjectURL;

  beforeEach(() => {
    // Save originals
    if (typeof document !== 'undefined') {
      originalCreateElement = document.createElement;
    }
    if (typeof URL !== 'undefined') {
      originalCreateObjectURL = URL.createObjectURL;
    }

    // Mock anchor element
    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
    };

    // Mock document
    const documentMock = {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') return mockAnchor;
        return {};
      }),
    };
    vi.stubGlobal('document', documentMock);

    // Mock URL
    const urlMock = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
    };
    vi.stubGlobal('URL', urlMock);

    // Mock Blob
    class MockBlob {
      constructor(public content: any[], public options: any) {}
    }
    vi.stubGlobal('Blob', MockBlob);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should handle data URLs correctly', () => {
    const content = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const fileName = 'test.png';
    const contentType = 'image/png';

    downloadFile(content, fileName, contentType);

    const doc = document as any;
    expect(doc.createElement).toHaveBeenCalledWith('a');

    // Check if properties on the mock element are set correctly
    const a = doc.createElement('a');
    expect(a.href).toBe(content);
    expect(a.download).toBe(fileName);
    expect(mockClick).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('should handle normal strings using Blob correctly', () => {
    const content = 'Hello, world!';
    const fileName = 'test.txt';
    const contentType = 'text/plain';

    downloadFile(content, fileName, contentType);

    const doc = document as any;
    expect(doc.createElement).toHaveBeenCalledWith('a');

    expect(URL.createObjectURL).toHaveBeenCalled();

    const a = doc.createElement('a');
    expect(a.href).toBe('blob:mock-url');
    expect(a.download).toBe(fileName);
    expect(mockClick).toHaveBeenCalled();
  });
});
