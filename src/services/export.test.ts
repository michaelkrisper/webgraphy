import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile } from './export';

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

    // We can't easily assert the Blob contents perfectly, but we can check if it was called
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
