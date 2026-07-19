import type { ParseConfig } from "./parser-types";

export function parseValue(
  val: string,
  config: ParseConfig | null | undefined,
  isComma: boolean,
  categoricalMap: Map<string, number>,
): number {
  if (val === undefined || val === null || val === "") return NaN;

  if (config?.type === "date") {
    return parseDate(val, config.dateFormat);
  }

  if (config?.type === "categorical") {
    if (!categoricalMap.has(val)) {
      categoricalMap.set(val, categoricalMap.size);
    }
    return categoricalMap.get(val) ?? 0;
  }
  const p = parseFloat(isComma ? val.replace(",", ".") : val);
  return Number.isNaN(p) ? NaN : p;
}

interface DateFormatIndices {
  yIdx: number;
  moIdx: number;
  dIdx: number;
  hIdx: number;
  miIdx: number;
  sIdx: number;
}

const dateFormatCache = new Map<string, DateFormatIndices>();

function getDateFormatIndices(format: string): DateFormatIndices {
  let cached = dateFormatCache.get(format);
  if (cached) return cached;
  cached = {
    yIdx: format.indexOf("YYYY"),
    moIdx: format.indexOf("MM"),
    dIdx: format.indexOf("DD"),
    hIdx: format.indexOf("HH"),
    miIdx: format.indexOf("mm"),
    sIdx: format.indexOf("ss"),
  };
  dateFormatCache.set(format, cached);
  return cached;
}

export function parseDate(val: string, format?: string): number {
  if (!format) {
    const d = new Date(val);
    return d.getTime() / 1000;
  }

  const idx = getDateFormatIndices(format);
  let year = 1970;
  let month = 0;
  let day = 1;
  let hour = 0;
  let min = 0;
  let sec = 0;

  if (idx.yIdx !== -1)
    year = parseInt(val.substring(idx.yIdx, idx.yIdx + 4), 10);
  if (idx.moIdx !== -1)
    month = parseInt(val.substring(idx.moIdx, idx.moIdx + 2), 10) - 1;
  if (idx.dIdx !== -1)
    day = parseInt(val.substring(idx.dIdx, idx.dIdx + 2), 10);
  if (idx.hIdx !== -1)
    hour = parseInt(val.substring(idx.hIdx, idx.hIdx + 2), 10);
  if (idx.miIdx !== -1)
    min = parseInt(val.substring(idx.miIdx, idx.miIdx + 2), 10);
  if (idx.sIdx !== -1)
    sec = parseInt(val.substring(idx.sIdx, idx.sIdx + 2), 10);

  // Match the previous local-time semantics (new Date(y, m, d, h, mi, s)) while
  // skipping the per-row Date allocation. Falls back to Date parsing if the
  // computed fields are out of range (e.g. malformed value).
  if (
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day) &&
    Number.isFinite(hour) &&
    Number.isFinite(min) &&
    Number.isFinite(sec)
  ) {
    dateScratch.setFullYear(year, month, day);
    dateScratch.setHours(hour, min, sec, 0);
    return dateScratch.getTime() / 1000;
  }

  const d = new Date(val);
  return d.getTime() / 1000;
}

const dateScratch = new Date();
