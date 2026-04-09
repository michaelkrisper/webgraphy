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
    const result = secureJSONParse(json);
    expect(result).toEqual({ a: 1 });
    expect(result.__proto__).not.toHaveProperty('polluted');
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

  it('should throw error for invalid JSON', () => {
    const json = '{"invalid": }';
    expect(() => secureJSONParse(json)).toThrow();
  });
});
