import { secureJSONParse } from "./json";
import type { ParseSettings, ColumnConfigEntry } from "./parser-types";
import { parseValue } from "./value-parser";

export async function parseJSON(file: File, settings?: ParseSettings) {
  const { decimalPoint = ".", columnConfigs = [] } = settings || {};

  const text = await file.text();
  let raw: unknown;
  try {
    // secureJSONParse strips __proto__/constructor keys to prevent prototype pollution.
    raw = secureJSONParse(text);
  } catch (error) {
    throw new Error(
      "Invalid JSON format: " +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }

  if (!Array.isArray(raw) || raw.length === 0)
    throw new Error(
      "Invalid JSON format: Expected a non-empty array of objects",
    );

  const allHeaders = Object.keys(raw[0]);
  const rowCount = raw.length;

  const configMap = new Map<number, ColumnConfigEntry>();
  for (let i = 0; i < columnConfigs.length; i++) {
    configMap.set(columnConfigs[i].index, columnConfigs[i]);
  }

  const configsByIndex = new Array(allHeaders.length);
  for (let j = 0; j < allHeaders.length; j++) {
    configsByIndex[j] = configMap.get(j);
  }

  const activeCols: number[] = [];
  const finalHeaders: string[] = [];
  for (let j = 0; j < allHeaders.length; j++) {
    if (configsByIndex[j]?.type !== "ignore") {
      activeCols.push(j);
      finalHeaders.push(configsByIndex[j]?.name || allHeaders[j]);
    }
  }
  const numActive = activeCols.length;

  // Column-major: data[col][row]. Lets us hand Float64Array slices to WebGL without per-row copies.
  const data: Float64Array[] = new Array(numActive);
  for (let k = 0; k < numActive; k++) {
    data[k] = new Float64Array(rowCount);
  }

  const categoricalMaps = new Array(numActive)
    .fill(null)
    .map(() => new Map<string, number>());
  const isComma = decimalPoint === ",";

  for (let i = 0; i < rowCount; i++) {
    const row = raw[i];

    for (let k = 0; k < numActive; k++) {
      const j = activeCols[k];
      const header = allHeaders[j];
      const config = configsByIndex[j];

      const val = row[header];
      const valStr = val === undefined || val === null ? "" : String(val);
      data[k][i] = parseValue(valStr, config, isComma, categoricalMaps[k]);
    }
  }

  return {
    columns: finalHeaders,
    rowCount: rowCount,
    data: data,
    categoricalMaps,
  };
}
