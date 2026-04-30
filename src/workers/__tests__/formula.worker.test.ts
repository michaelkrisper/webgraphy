import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Define a variable to hold the message handler
let workerMessageHandler: ((event: any) => void) | null = null;
const postMessageMock = vi.fn();

Object.defineProperty(globalThis, 'self', {
  value: {
    postMessage: postMessageMock,
    set onmessage(fn: (e: any) => void) {
      workerMessageHandler = fn;
    },
    get onmessage() {
      return workerMessageHandler;
    }
  },
  writable: true
});

describe('formula.worker', () => {
  beforeAll(async () => {
    await import('../formula.worker');
  });

  beforeEach(() => {
    postMessageMock.mockClear();
  });

  it('should be registered as a message listener', () => {
     expect(workerMessageHandler).toBeTypeOf('function');
  });

  it('should handle evaluation failure from syntax errors', () => {
    const event = {
      data: {
        datasetId: 'ds-1',
        name: 'result',
        formula: 'invalid syntax(',
        columns: ['A', 'B'],
        rowCount: 10,
        columnData: [
          { data: new Float32Array(10), refPoint: 0 },
          { data: new Float32Array(10), refPoint: 0 }
        ]
      }
    };

    // @ts-ignore
    workerMessageHandler!(event);

    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'error',
      error: expect.stringContaining('Unknown function or constant')
    });
  });

  it('should handle exception during evaluation', () => {
    const event = {
      data: {
        datasetId: 'ds-1',
        name: 'result',
        formula: '[A] + [B]',
        columns: ['A', 'B'],
        rowCount: 10,
        columnData: undefined // This will cause TypeError when trying to access columnData in the main loop
      }
    };

    // @ts-ignore
    workerMessageHandler!(event);

    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'error',
      error: expect.stringContaining('Cannot read properties of undefined') // Works for typical Node TypeError
    });
  });
});
