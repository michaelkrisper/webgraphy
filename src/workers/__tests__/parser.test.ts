import { describe, it, expect } from 'vitest';

// Re-implement or import the parser logic
// Since it's in a worker, we'll extract the core functions for testing

interface ParseConfig {
  type?: 'date' | 'categorical' | 'numeric' | 'ignore';
  dateFormat?: string;
}

function parseValue(val: string, config: ParseConfig | null, decimalPoint: string, categoricalMap: Map<string, number>): number {
  if (val === undefined || val === null || val === '') return NaN;

  if (config?.type === 'date') {
    return parseDate(val, config.dateFormat);
  }

  if (config?.type === 'categorical') {
    if (!categoricalMap.has(val)) {
      categoricalMap.set(val, categoricalMap.size);
    }
    return categoricalMap.get(val)!;
  }

  // Default: numeric
  const normalized = decimalPoint === ',' ? val.replace(',', '.') : val;
  const p = parseFloat(normalized);
  return isNaN(p) ? NaN : p;
}

function parseDate(val: string, format?: string): number {
  if (!format) {
    const d = new Date(val);
    return d.getTime() / 1000;
  }

  try {
    let year = 1970, month = 0, day = 1, hour = 0, min = 0, sec = 0;

    const parts = {
      YYYY: { idx: format.indexOf('YYYY'), len: 4 },
      MM: { idx: format.indexOf('MM'), len: 2 },
      DD: { idx: format.indexOf('DD'), len: 2 },
      HH: { idx: format.indexOf('HH'), len: 2 },
      mm: { idx: format.indexOf('mm'), len: 2 },
      ss: { idx: format.indexOf('ss'), len: 2 }
    };

    if (parts.YYYY.idx !== -1) year = parseInt(val.substring(parts.YYYY.idx, parts.YYYY.idx + 4));
    if (parts.MM.idx !== -1) month = parseInt(val.substring(parts.MM.idx, parts.MM.idx + 2)) - 1;
    if (parts.DD.idx !== -1) day = parseInt(val.substring(parts.DD.idx, parts.DD.idx + 2));
    if (parts.HH.idx !== -1) hour = parseInt(val.substring(parts.HH.idx, parts.HH.idx + 2));
    if (parts.mm.idx !== -1) min = parseInt(val.substring(parts.mm.idx, parts.mm.idx + 2));
    if (parts.ss.idx !== -1) sec = parseInt(val.substring(parts.ss.idx, parts.ss.idx + 2));

    const d = new Date(year, month, day, hour, min, sec);
    return d.getTime() / 1000;
  } catch {
    const d = new Date(val);
    return d.getTime() / 1000;
  }
}

describe('Data Parser Core Logic', () => {
  describe('parseValue', () => {
    it('should parse numeric values with dot decimal point', () => {
      expect(parseValue('123.45', null, '.', new Map())).toBe(123.45);
    });

    it('should parse numeric values with comma decimal point', () => {
      expect(parseValue('123,45', null, ',', new Map())).toBe(123.45);
    });

    it('should parse categorical values', () => {
      const map = new Map<string, number>();
      expect(parseValue('Apple', { type: 'categorical' }, '.', map)).toBe(0);
      expect(parseValue('Banana', { type: 'categorical' }, '.', map)).toBe(1);
      expect(parseValue('Apple', { type: 'categorical' }, '.', map)).toBe(0);
    });

    it('should parse dates with arbitrary formats', () => {
      // 2025-12-24
      const ts = parseValue('2025-12-24', { type: 'date', dateFormat: 'YYYY-MM-DD' }, '.', new Map());
      const d = new Date(ts * 1000);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(11); // December
      expect(d.getDate()).toBe(24);

      // 01.01.2025
      const ts2 = parseValue('01.01.2025', { type: 'date', dateFormat: 'DD.MM.YYYY' }, '.', new Map());
      const d2 = new Date(ts2 * 1000);
      expect(d2.getFullYear()).toBe(2025);
      expect(d2.getMonth()).toBe(0); // January
      expect(d2.getDate()).toBe(1);
    });
  });
});
