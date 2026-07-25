import { describe, it, expect, vi } from "vitest";
import { parseJSON } from "../json-parser";
import type { ParseSettings, ColumnConfigEntry } from "../parser-types";
import { secureJSONParse } from "../json";

vi.mock("../json", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../json")>();
  return {
    ...mod,
    secureJSONParse: vi.fn(mod.secureJSONParse),
  };
});

describe("json-parser", () => {
  const createMockFile = (content: string) => {
    return {
      text: vi.fn().mockResolvedValue(content),
    } as unknown as File;
  };

  it("should throw on invalid JSON", async () => {
    const file = createMockFile("invalid json");
    await expect(parseJSON(file)).rejects.toThrow("Invalid JSON format");
  });

  it("should throw on invalid JSON object without error message", async () => {
    vi.mocked(secureJSONParse).mockImplementationOnce(() => { throw "Some string error"; });
    const file = createMockFile("{}");
    await expect(parseJSON(file)).rejects.toThrow("Invalid JSON format: Some string error");
  });

  it("should throw if not an array", async () => {
    const file = createMockFile('{"a": 1}');
    await expect(parseJSON(file)).rejects.toThrow("Expected a non-empty array of objects");
  });

  it("should throw if empty array", async () => {
    const file = createMockFile("[]");
    await expect(parseJSON(file)).rejects.toThrow("Expected a non-empty array of objects");
  });

  it("should parse valid JSON without settings", async () => {
    const file = createMockFile('[{"a": 1, "b": 2}, {"a": 3, "b": 4}]');
    const result = await parseJSON(file);

    expect(result.columns).toEqual(["a", "b"]);
    expect(result.rowCount).toBe(2);
    expect(result.data.length).toBe(2);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[0][1]).toBe(3);
    expect(result.data[1][0]).toBe(2);
    expect(result.data[1][1]).toBe(4);

    expect(result.categoricalMaps.length).toBe(2);
    expect(result.categoricalMaps[0].size).toBe(0);
  });

  it("should parse valid JSON with column configurations and ignore", async () => {
    const file = createMockFile('[{"a": 1, "b": 2}, {"a": 3, "b": 4}]');
    const settings: ParseSettings = {
      columnConfigs: [
        { index: 0, name: "Alpha", type: "number" },
        { index: 1, name: "Beta", type: "ignore" },
      ] as ColumnConfigEntry[],
    };
    const result = await parseJSON(file, settings);

    expect(result.columns).toEqual(["Alpha"]);
    expect(result.rowCount).toBe(2);
    expect(result.data.length).toBe(1);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[0][1]).toBe(3);
  });

  it("should handle missing or null values and undefined", async () => {
    const file = createMockFile('[{"a": 1}, {"b": 2}, {"a": null}]');
    const result = await parseJSON(file);

    expect(result.columns).toEqual(["a"]); // Object.keys(raw[0]) determines headers
    expect(result.rowCount).toBe(3);
    expect(result.data[0][0]).toBe(1);
    expect(Number.isNaN(result.data[0][1])).toBe(true);
    expect(Number.isNaN(result.data[0][2])).toBe(true);
  });

  it("should handle categorical values", async () => {
    const file = createMockFile('[{"cat": "red"}, {"cat": "blue"}, {"cat": "red"}]');
    const settings: ParseSettings = {
      columnConfigs: [
        { index: 0, name: "cat", type: "categorical" }
      ] as ColumnConfigEntry[],
    };
    const result = await parseJSON(file, settings);

    expect(result.columns).toEqual(["cat"]);
    expect(result.data[0][0]).toBe(0); // red -> 0
    expect(result.data[0][1]).toBe(1); // blue -> 1
    expect(result.data[0][2]).toBe(0); // red -> 0

    expect(result.categoricalMaps[0].get("red")).toBe(0);
    expect(result.categoricalMaps[0].get("blue")).toBe(1);
  });

  it("should parse with comma decimal point", async () => {
    const file = createMockFile('[{"val": "1,23"}, {"val": "4,56"}]');
    const settings: ParseSettings = {
      decimalPoint: ",",
    };
    const result = await parseJSON(file, settings);

    expect(result.columns).toEqual(["val"]);
    expect(result.data[0][0]).toBe(1.23);
    expect(result.data[0][1]).toBe(4.56);
  });
});
