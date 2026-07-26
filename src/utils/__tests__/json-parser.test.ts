import { describe, it, expect, vi } from 'vitest';

vi.mock('../json', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../json')>();
  return {
    ...actual,
    secureJSONParse: vi.fn(actual.secureJSONParse)
  };
});

import { parseJSON } from '../json-parser';
import { secureJSONParse } from '../json';

function createFile(content: string): File {
  return new File([content], 'test.json', { type: 'application/json' });
}

describe('parseJSON', () => {
  it('should parse valid JSON correctly without settings', async () => {
    const jsonString = JSON.stringify([
      { a: 1, b: "x" },
      { a: 2, b: "y" }
    ]);
    const file = createFile(jsonString);

    const result = await parseJSON(file);

    expect(result.columns).toEqual(['a', 'b']);
    expect(result.rowCount).toBe(2);
    expect(result.data[0]).toEqual(new Float64Array([1, 2]));
    // Without columnConfig, default parser is used (number). "x" and "y" are not parsed as numbers so they result in NaN
    expect(Number.isNaN(result.data[1][0])).toBe(true);
    expect(Number.isNaN(result.data[1][1])).toBe(true);
  });

  it('should parse categorical columns correctly with settings', async () => {
    const jsonString = JSON.stringify([
      { a: 1, b: "x" },
      { a: 2, b: "y" },
      { a: 3, b: "x" }
    ]);
    const file = createFile(jsonString);
    const settings = {
      columnConfigs: [
        { index: 1, name: "b_cat", type: "categorical" as const }
      ]
    };

    const result = await parseJSON(file, settings);

    expect(result.columns).toEqual(['a', 'b_cat']);
    expect(result.data[1]).toEqual(new Float64Array([0, 1, 0]));
    expect(result.categoricalMaps[1].get("x")).toBe(0);
    expect(result.categoricalMaps[1].get("y")).toBe(1);
  });

  it('should rename and ignore columns based on columnConfigs', async () => {
    const jsonString = JSON.stringify([
      { a: 1, b: 2, c: 3 }
    ]);
    const file = createFile(jsonString);

    const settings = {
      columnConfigs: [
        { index: 0, name: "Alpha", type: "number" as const },
        { index: 1, type: "ignore" as const },
        { index: 2, name: "Charlie" }
      ]
    };

    const result = await parseJSON(file, settings);

    expect(result.columns).toEqual(['Alpha', 'Charlie']);
    expect(result.rowCount).toBe(1);
    expect(result.data.length).toBe(2);
    expect(result.data[0]).toEqual(new Float64Array([1]));
    expect(result.data[1]).toEqual(new Float64Array([3]));
  });

  it('should handle comma as decimal point', async () => {
    const jsonString = JSON.stringify([
      { val: "3,14" }
    ]);
    const file = createFile(jsonString);

    const result = await parseJSON(file, { decimalPoint: "," });

    expect(result.data[0]).toEqual(new Float64Array([3.14]));
  });

  it('should handle missing keys as empty string resulting in NaN', async () => {
    const jsonString = '[{"a": 1}, {}]';
    const file = createFile(jsonString);

    const result = await parseJSON(file);

    expect(result.data[0][0]).toBe(1);
    expect(Number.isNaN(result.data[0][1])).toBe(true);
  });

  it('should handle explicit null values as empty string resulting in NaN', async () => {
    const jsonString = '[{"a": null}]';
    const file = createFile(jsonString);

    const result = await parseJSON(file);

    expect(Number.isNaN(result.data[0][0])).toBe(true);
  });

  it('should throw an error for invalid JSON format', async () => {
    const file = createFile('{ invalid json }');

    await expect(parseJSON(file)).rejects.toThrow(/Invalid JSON format/);
  });

  it('should throw an error for non-array JSON', async () => {
    const file = createFile('{"a": 1}');

    await expect(parseJSON(file)).rejects.toThrow('Invalid JSON format: Expected a non-empty array of objects');
  });

  it('should throw an error for empty array JSON', async () => {
    const file = createFile('[]');

    await expect(parseJSON(file)).rejects.toThrow('Invalid JSON format: Expected a non-empty array of objects');
  });

  it('should handle thrown non-Error objects in secureJSONParse', async () => {
    vi.mocked(secureJSONParse).mockImplementationOnce(() => {
      throw 'String error';
    });
    const file = createFile('[{}]');

    await expect(parseJSON(file)).rejects.toThrow('Invalid JSON format: String error');
  });
});
