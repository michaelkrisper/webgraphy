/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { secureJSONParse } from '../json';

describe('secureJSONParse', () => {
  it('should parse valid JSON', () => {
    const json = '{"a": 1, "b": "test", "c": [1, 2, 3]}';
    const result = secureJSONParse(json);
    expect(result).toEqual({ a: 1, b: 'test', c: [1, 2, 3] });
  });

  it('should filter out __proto__ key', () => {
    const json = '{"a": 1, "__proto__": {"polluted": "yes"}}';
    const result = secureJSONParse(json) as any;
    expect(result).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    // In JS, result.__proto__ is still the Object prototype, but it shouldn't have been polluted.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('should filter out prototype key', () => {
    const json = '{"a": 1, "prototype": {"polluted": "yes"}}';
    const result = secureJSONParse(json);
    expect(result).toEqual({ a: 1 });
    expect((result as Record<string, unknown>).prototype).toBeUndefined();
  });

  it('should filter out constructor key', () => {
    const json = '{"a": 1, "constructor": {"prototype": {"polluted": "yes"}}}';
    const result = secureJSONParse(json);
    expect(result).toEqual({ a: 1 });
    expect(result.constructor).toBe(Object);
  });

  it('should filter out dangerous keys in nested objects', () => {
    const json = '{"nested": {"__proto__": {"polluted": "yes"}, "valid": 123}}';
    const result = secureJSONParse(json);
    expect((result as Record<string, unknown>).nested).toEqual({ valid: 123 });
    expect(((result as Record<string, Record<string, unknown>>).nested).__proto__).not.toHaveProperty('polluted');
  });

  it('should filter out dangerous keys in arrays', () => {
    const json = '[{"__proto__": {"polluted": "yes"}}, {"valid": 1}]';
    const result = secureJSONParse(json);
    expect(result).toEqual([{}, { valid: 1 }]);
  });

  it('should filter out dangerous keys in deeply nested structures', () => {
    // Note: We use computed property names or raw strings because JSON.stringify
    // skips __proto__ when defined directly in an object literal.
    const json = JSON.stringify({
      level1: {
        ['__proto__']: { polluted: 'level1' },
        level2: [
          {
            constructor: { prototype: { polluted: 'level2' } },
            valid: true
          },
          {
            prototype: { polluted: 'level2_alt' },
            nested: {
              ['__proto__']: { polluted: 'level3' }
            }
          }
        ]
      }
    });
    const result = secureJSONParse(json) as any;
    expect(result.level1.__proto__).not.toHaveProperty('polluted');
    expect(result.level1.level2[0].constructor).toBe(Object);
    expect(result.level1.level2[0].valid).toBe(true);
    expect(result.level1.level2[1].prototype).toBeUndefined();
    expect(result.level1.level2[1].nested.__proto__).not.toHaveProperty('polluted');

    // Check global state
    expect(({} as any).polluted).toBeUndefined();
  });

  it('should throw error for invalid JSON', () => {
    const json = '{"invalid": }';
    expect(() => secureJSONParse(json)).toThrow();
  });
});
