import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { secureRandom } from '../random';

describe('secureRandom', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns values in the expected range [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const val = secureRandom();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('buffers values and only calls crypto.getRandomValues every 1024 calls', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');

    // We don't know the exact current index, so let's exhaust the current buffer first
    let callsBefore = spy.mock.calls.length;
    while (spy.mock.calls.length === callsBefore) {
      secureRandom();
    }

    // Now the buffer has just been refilled.
    // The index is currently 1 (because secureRandom increments it).
    // The next 1023 calls should not trigger getRandomValues.
    spy.mockClear();

    for (let i = 0; i < 1023; i++) {
      secureRandom();
    }

    expect(spy).not.toHaveBeenCalled();

    // The 1024th call should trigger a refill
    secureRandom();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('correctly maps 32-bit unsigned integers to [0, 1)', async () => {
    // We need to mock crypto.getRandomValues to test the division logic
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((arr: any) => {
      arr[0] = 0;
      arr[1] = 2147483648; // half of 2^32
      arr[2] = 4294967295; // 2^32 - 1
      return arr;
    });

    // Exhaust buffer to trigger refill
    let callsBefore = spy.mock.calls.length;
    let firstVal;
    while (spy.mock.calls.length === callsBefore) {
      firstVal = secureRandom();
    }

    // Now index was refilled and we took the first element, so firstVal is arr[0]
    const val2 = secureRandom(); // arr[1]
    const val3 = secureRandom(); // arr[2]

    expect(firstVal).toBe(0);
    expect(val2).toBe(0.5);
    // 4294967295 / 4294967296 = 0.9999999997671694
    expect(val3).toBeCloseTo(0.9999999997671694, 10);

    spy.mockRestore();
  });
});
