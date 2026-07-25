import { describe, test, expect } from "vitest";
import { parseCSV, splitCSVLine } from "../csv-parser";
import { ColumnConfigEntry } from "../parser-types";

// Helper to create a mock File with a working stream() method
function createMockFile(content: string, name = "test.csv"): File {
  const encoder = new TextEncoder();

  // We simulate chunking by splitting lines
  const lines = content.split('\n');
  const chunks = lines.map((line, idx) =>
    encoder.encode(line + (idx < lines.length - 1 ? '\n' : ''))
  );

  return {
    name,
    stream: () => {
      let i = 0;
      return {
        getReader: () => ({
          read: async () => {
            if (i < chunks.length) {
              return { done: false, value: chunks[i++] };
            }
            return { done: true, value: undefined };
          }
        })
      };
    }
  } as unknown as File;
}

describe("splitCSVLine", () => {
  test("splits single char delimiter", () => {
    expect(splitCSVLine("a,b,c", ",")).toEqual(["a", "b", "c"]);
  });

  test("handles quotes with single char delimiter", () => {
    expect(splitCSVLine('a,"b,c",d', ",")).toEqual(["a", '"b,c"', "d"]);
    expect(splitCSVLine('"a,b",c', ",")).toEqual(['"a,b"', "c"]);
    expect(splitCSVLine('a,"b,c"', ",")).toEqual(["a", '"b,c"']);
  });

  test("splits multi char delimiter", () => {
    expect(splitCSVLine("a||b||c", "||")).toEqual(["a", "b", "c"]);
    expect(splitCSVLine("a||||c", "||")).toEqual(["a", "", "c"]);
  });
});

describe("parseCSV", () => {
  test("parses simple CSV", async () => {
    const file = createMockFile("A,B\n1,2\n3,4");
    const result = await parseCSV(file);

    expect(result.columns).toEqual(["A", "B"]);
    expect(result.rowCount).toBe(2);
    expect(result.data.length).toBe(2);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[0][1]).toBe(3);
    expect(result.data[1][0]).toBe(2);
    expect(result.data[1][1]).toBe(4);
  });

  test("handles empty file error", async () => {
    const file = createMockFile("");
    await expect(parseCSV(file)).rejects.toThrow("Empty CSV file");
  });

  test("respects startRow", async () => {
    const file = createMockFile("skip\nskip2\nA,B\n1,2");
    const result = await parseCSV(file, { startRow: 3 });

    expect(result.columns).toEqual(["A", "B"]);
    expect(result.rowCount).toBe(1);
    expect(result.data[0][0]).toBe(1);
  });

  test("respects commentChar", async () => {
    const file = createMockFile("# comment\nA,B\n# another comment\n1,2");
    const result = await parseCSV(file, { commentChar: "#" });

    expect(result.columns).toEqual(["A", "B"]);
    expect(result.rowCount).toBe(1);
    expect(result.data[0][0]).toBe(1);
  });

  test("strips BOM", async () => {
    const encoder = new TextEncoder();
    const bomChunk = new Uint8Array([0xef, 0xbb, 0xbf]);
    const restChunk = encoder.encode("A,B\n1,2");

    const bomFile = {
      stream: () => {
        let i = 0;
        return {
          getReader: () => ({
            read: async () => {
              if (i === 0) { i++; return { done: false, value: bomChunk }; }
              if (i === 1) { i++; return { done: false, value: restChunk }; }
              return { done: true, value: undefined };
            }
          })
        };
      }
    } as unknown as File;

    const result = await parseCSV(bomFile);
    expect(result.columns).toEqual(["A", "B"]);
    expect(result.data[0][0]).toBe(1);
  });

  test("handles multi-character delimiter fallback", async () => {
    const file = createMockFile("A||B\n1||2\n3||4");
    const result = await parseCSV(file, { delimiter: "||" });

    expect(result.columns).toEqual(["A", "B"]);
    expect(result.rowCount).toBe(2);
    expect(result.data.length).toBe(2);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[1][1]).toBe(4);
  });

  test("handles empty lines", async () => {
    const file = createMockFile("A,B\n\n1,2\n\n3,4\n");
    const result = await parseCSV(file);

    expect(result.rowCount).toBe(2);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[0][1]).toBe(3);
  });

  test("handles quotes around fields in row", async () => {
    const file = createMockFile('A,B\n"1","2"');
    const result = await parseCSV(file);

    expect(result.rowCount).toBe(1);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[1][0]).toBe(2);
  });

  test("handles column configs filtering", async () => {
    const file = createMockFile("A,B,C\n1,2,3");
    const configs: ColumnConfigEntry[] = [
      { index: 0, name: "A", type: "number" },
      { index: 1, name: "B", type: "ignore" },
      { index: 2, name: "NewC", type: "number" }
    ];

    const result = await parseCSV(file, { columnConfigs: configs });

    expect(result.columns).toEqual(["A", "NewC"]);
    expect(result.data.length).toBe(2);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[1][0]).toBe(3);
  });

  test("handles european decimal point", async () => {
    const file = createMockFile("A;B\n1,2;3,4");
    const result = await parseCSV(file, { delimiter: ";", decimalPoint: "," });

    expect(result.data[0][0]).toBe(1.2);
    expect(result.data[1][0]).toBe(3.4);
  });

  test("handles quotes with multi-character delimiters", async () => {
    const file = createMockFile('A||B\n"1"||"2"');
    const result = await parseCSV(file, { delimiter: "||" });

    expect(result.rowCount).toBe(1);
    expect(result.data[0][0]).toBe(1);
    expect(result.data[1][0]).toBe(2);
  });

  test("handles capacity expansion", async () => {
    const lines = ["A,B"];
    for (let i = 0; i < 2000; i++) {
      lines.push(`${i},${i}`);
    }
    const file = createMockFile(lines.join("\n"));
    const result = await parseCSV(file);

    expect(result.rowCount).toBe(2000);
    expect(result.data[0][0]).toBe(0);
    expect(result.data[0][1999]).toBe(1999);
  });
});
