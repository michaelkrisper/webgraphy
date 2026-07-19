// Data Parser (v0.5.0 - Main Thread)

import type { DataColumn, ParsedDataset } from "../services/persistence";
import { processRawColumn } from "./data-processing";

import { parseCSV, splitCSVLine } from "./csv-parser";
import { parseJSON } from "./json-parser";
import type { ParseSettings, ColumnConfigEntry } from "./parser-types";

export type { ParseSettings, ColumnConfigEntry };
export { splitCSVLine };

interface DataGroup {
  name: string;
  rowIdxs: number[] | null;
}

function groupDataRows(
  allColumns: string[],
  allData: Float64Array[],
  totalRows: number,
  categoricalMaps: Map<string, number>[],
  configByName: Map<string, ColumnConfigEntry>,
  splitColNames: string[],
): {
  groups: DataGroup[];
  splitColIdxSet: Set<number>;
} {
  // Group row indices by combined values across all split columns. Each
  // active split column must be categorical and present in active columns.
  const splitColIdxs: number[] = [];
  const splitColIdxSet = new Set<number>();
  for (const name of splitColNames) {
    const idx = allColumns.indexOf(name);
    const cfg = configByName.get(name);
    if (idx >= 0 && cfg?.type === "categorical") {
      splitColIdxs.push(idx);
      splitColIdxSet.add(idx);
    }
  }
  const doSplit = splitColIdxs.length > 0;

  // rowIdxs === null means "identity mapping" — every row index maps to itself.
  // Keeps the non-split fast path from allocating a redundant index array.
  const groups: DataGroup[] = [];
  if (doSplit) {
    const valueToNames = splitColIdxs.map((idx) => {
      const m = new Map<number, string>();
      categoricalMaps[idx].forEach((id, key) => {
        m.set(id, key);
      });
      return m;
    });
    const groupByKey = new Map<string, { name: string; rowIdxs: number[] }>();
    for (let r = 0; r < totalRows; r++) {
      let key = "";
      let name = "";
      for (let s = 0; s < splitColIdxs.length; s++) {
        const v = allData[splitColIdxs[s]][r];
        const label = valueToNames[s].get(v) ?? String(v);
        if (s > 0) {
          key += "\0";
          name += " / ";
        }
        key += String(v);
        name += label;
      }
      let g = groupByKey.get(key);
      if (!g) {
        g = { name, rowIdxs: [] };
        groupByKey.set(key, g);
      }
      g.rowIdxs.push(r);
    }
    groupByKey.forEach((g) => {
      groups.push(g);
    });
    groups.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    groups.push({ name: "", rowIdxs: null });
  }

  return { groups, splitColIdxSet };
}

function buildDatasets(
  groups: DataGroup[],
  file: File,
  allColumns: string[],
  allData: Float64Array[],
  totalRows: number,
  categoricalMaps: Map<string, number>[],
  configByName: Map<string, ColumnConfigEntry>,
  splitColIdxSet: Set<number>,
  settings?: ParseSettings,
): ParsedDataset[] {
  const doSplit = splitColIdxSet.size > 0;
  // Output columns exclude the split columns themselves
  const outputColIdxs: number[] = [];
  const outputColumns: string[] = [];
  for (let i = 0; i < allColumns.length; i++) {
    if (doSplit && splitColIdxSet.has(i)) continue;
    outputColIdxs.push(i);
    outputColumns.push(allColumns[i]);
  }

  const datasets = groups.map((group) => {
    const rowIdxs = group.rowIdxs;
    const groupRowCount = rowIdxs === null ? totalRows : rowIdxs.length;
    const colCount = outputColIdxs.length;
    const relativeData = new Array(colCount);
    for (let j = 0; j < colCount; j++) {
      const src = allData[outputColIdxs[j]];
      if (rowIdxs === null) {
        // Identity mapping — processRawColumn doesn't mutate src.
        relativeData[j] = processRawColumn(src);
      } else {
        const gathered = new Float64Array(groupRowCount);
        for (let r = 0; r < groupRowCount; r++) gathered[r] = src[rowIdxs[r]];
        relativeData[j] = processRawColumn(gathered);
      }
    }

    const baseName = group.name ? `${file.name} (${group.name})` : file.name;
    return {
      id: crypto.randomUUID(),
      name: baseName,
      columns: outputColumns,
      rowCount: groupRowCount,
      xAxisColumn: settings?.xAxisColumn,
      data: outputColumns.map((colName, colIdx) => {
        const config = configByName.get(colName);
        const isDate =
          config?.type === "date" ||
          (!config?.type &&
            (colIdx === 0 ||
              colName.toLowerCase().includes("time") ||
              colName.toLowerCase().includes("date")));
        let categoryLabels: string[] | undefined;
        if (config?.type === "categorical") {
          const srcIdx = outputColIdxs[colIdx];
          const map = categoricalMaps[srcIdx];
          const labels = new Array(map.size);
          map.forEach((id, key) => {
            labels[id] = key;
          });
          categoryLabels = labels;
        }
        return {
          isFloat64: isDate,
          refPoint: relativeData[colIdx].refPoint,
          bounds: relativeData[colIdx].bounds,
          data: relativeData[colIdx].data,
          categoryLabels,
        } as DataColumn;
      }),
    };
  });

  return datasets;
}

export async function parseData(
  file: File,
  type: string,
  settings?: ParseSettings,
): Promise<ParsedDataset[]> {
  let result: Awaited<ReturnType<typeof parseCSV>>;
  if (type === "csv") result = await parseCSV(file, settings);
  else if (type === "json") result = await parseJSON(file, settings);
  else throw new Error(`Unsupported file type: ${type}`);

  const allColumns: string[] = result.columns;
  const allData: Float64Array[] = result.data;
  const totalRows: number = result.rowCount;
  const categoricalMaps: Map<string, number>[] = result.categoricalMaps;

  const configByName = new Map<string, ColumnConfigEntry>();
  if (settings?.columnConfigs) {
    for (let i = 0; i < settings.columnConfigs.length; i++) {
      const config = settings.columnConfigs[i];
      if (config.name) configByName.set(config.name, config);
    }
  }

  const { groups, splitColIdxSet } = groupDataRows(
    allColumns,
    allData,
    totalRows,
    categoricalMaps,
    configByName,
    settings?.splitByColumns ?? [],
  );

  return buildDatasets(
    groups,
    file,
    allColumns,
    allData,
    totalRows,
    categoricalMaps,
    configByName,
    splitColIdxSet,
    settings,
  );
}
