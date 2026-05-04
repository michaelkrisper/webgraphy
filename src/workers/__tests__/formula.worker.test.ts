import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Define a variable to hold the message handler
let workerMessageHandler: ((event: MessageEvent) => void) | null = null;
const postMessageMock = vi.fn();

Object.defineProperty(globalThis, 'self', {
  value: {
    postMessage: postMessageMock,
    set onmessage(fn: (e: MessageEvent) => void) {
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

    // @ts-expect-error - Event type mismatch in test
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

    // @ts-expect-error - Event type mismatch in test
    workerMessageHandler!(event);

    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'error',
      error: expect.stringContaining('Cannot read properties of undefined') // Works for typical Node TypeError
    });
  });

  it('should apply forward shift for count-based rolling average (central alignment)', () => {
    // Formula: avg3([A]) -> num=3, align='c' (default) -> shift = floor(3/2) = 1
    // Input [10, 20, 30, 40]
    // resultData before shift:
    // i=0: [10]/1 = 10
    // i=1: [10,20]/2 = 15
    // i=2: [10,20,30]/3 = 20
    // i=3: [20,30,40]/3 = 30
    // resultData: [10, 15, 20, 30]
    // After shift forward by 1:
    // out[0] = resultData[1] = 15
    // out[1] = resultData[2] = 20
    // out[2] = resultData[3] = 30
    // out[3] = resultData[3] = 30 (padding with last)
    // Final: [15, 20, 30, 30]

    const data = new Float32Array([10, 20, 30, 40]);
    const event = {
      data: {
        datasetId: 'ds-1',
        name: 'result',
        formula: 'avg3([A])',
        columns: ['A'],
        rowCount: 4,
        columnData: [
          { data, refPoint: 0 }
        ]
      }
    };

    // @ts-expect-error - Event type mismatch in test
    workerMessageHandler!(event);

    expect(postMessageMock).toHaveBeenCalled();
    const lastCall = postMessageMock.mock.calls[postMessageMock.mock.calls.length - 1][0];
    expect(lastCall.type).toBe('success');

    // The data is returned as a Float32Array via processRawColumn
    // resultData in worker is Float64Array, processRawColumn might downcast or keep it
    const outputData = lastCall.newColumn.data;
    const ref = lastCall.newColumn.refPoint;

    expect(outputData[0] + ref).toBeCloseTo(15);
    expect(outputData[1] + ref).toBeCloseTo(20);
    expect(outputData[2] + ref).toBeCloseTo(30);
    expect(outputData[3] + ref).toBeCloseTo(30);
  });
});
