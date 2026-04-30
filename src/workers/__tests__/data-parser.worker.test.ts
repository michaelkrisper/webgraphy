import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('data-parser.worker', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should post an error message when an exception occurs', async () => {
    const postMessageMock = vi.fn();

    // We need to inject our mock into the worker environment
    // The worker does self.onmessage = ... and calls self.postMessage(...)

    global.self = {
      postMessage: postMessageMock,
    } as any;

    // Dynamically import the worker module
    await import('../data-parser.worker');

    // Now self.onmessage should be defined
    expect(global.self.onmessage).toBeDefined();

    // Trigger the handler with invalid data to cause an error
    await global.self.onmessage({
      data: {
        file: null, // this should cause an error
        type: 'unsupported'
      }
    } as any);

    // Verify that postMessage was called with an error
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        error: expect.stringContaining('Unsupported file type')
      })
    );
  });

  it('should handle native Error instances in catch block', async () => {
    const postMessageMock = vi.fn();

    global.self = {
      postMessage: postMessageMock,
    } as any;

    await import('../data-parser.worker');

    // Mock the file to throw a specific error during parsing
    const mockFile = {
      name: 'test.csv',
      stream: () => {
        throw new Error('File stream error');
      }
    };

    await global.self.onmessage({
      data: {
        file: mockFile,
        type: 'csv',
        settings: {}
      }
    } as any);

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        error: 'File stream error'
      })
    );
  });

  it('should handle non-Error instances in catch block', async () => {
    const postMessageMock = vi.fn();

    global.self = {
      postMessage: postMessageMock,
    } as any;

    await import('../data-parser.worker');

    // We can simulate a string throw by making the stream method throw a string
    const mockFile = {
      name: 'test.csv',
      stream: () => {
        throw 'String error thrown';
      }
    };

    await global.self.onmessage({
      data: {
        file: mockFile,
        type: 'csv',
        settings: {}
      }
    } as any);

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        error: 'String error thrown'
      })
    );
  });
});
